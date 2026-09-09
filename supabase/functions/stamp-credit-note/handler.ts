// Pure handler for stamp-credit-note, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";
import { computeStampVariance, roundMoney } from "../_shared/money.ts";
import { checkStampFx } from "../_shared/fxGate.ts";
import { validateCreditNoteSourceLines } from "../_shared/creditNoteSourceValidation.ts";

export type { SupabaseLike };
export interface StampCreditNoteDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
}

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const BUCKET = "cfdi-files";

export async function handleStampCreditNote(
  req: Request,
  deps: StampCreditNoteDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number, _headers?: unknown) =>
    jsonResponse(req, body, { status });
  const jsonHeaders = undefined;

  let credit_note_id: unknown = undefined;
  let userId: string | undefined = undefined;
  // Referencias externas al try para que el outer-catch pueda liberar el claim
  // atómico ante excepciones inesperadas y evitar que la NC quede en "stamping".
  let supabaseRef: SupabaseLike | null = null;
  let claimed = false;
  // R9-13: una vez que Facturapi confirma la emisión, el CFDI de egreso YA
  // EXISTE ante el SAT. Si algo falla después (persistencia, red, excepción
  // inesperada), el outer-catch NO debe marcar 'error' ni permitir reintento
  // ciego — eso duplicaría el timbrado. En ese caso la NC se deja en
  // 'stamping' (con evidencia si se alcanzó a capturar) para que
  // `reconcile-stamping-invoices` la reconcilie por external_id/facturapi_id.
  let pacEmitted = false;
  let emittedFacturapiId: string | null = null;
  let emittedCfdiUuid: string | null = null;
  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[stamp-credit-note]",
    });
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status, jsonHeaders);
    }
    userId = auth.userId;
    const supabase = auth.supabase;
    supabaseRef = supabase;

    const body = await req.json().catch(() => null);
    credit_note_id = body?.credit_note_id;
    if (!isUUID(credit_note_id)) {
      console.error("[stamp-credit-note] invalid credit_note_id", { userId });
      return json({ error: "credit_note_id must be UUID" }, 400, jsonHeaders);
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("id", credit_note_id)
      .single();
    if (ncErr || !nc) {
      console.error("[stamp-credit-note] credit note not found", {
        credit_note_id,
        userId,
        err: ncErr instanceof Error ? ncErr.message : String(ncErr),
      });
      return json({ error: "Credit note not found" }, 404, jsonHeaders);
    }
    const initialNcRow = nc as Record<string, unknown>;
    if (initialNcRow.cfdi_status === "stamped") {
      console.error("[stamp-credit-note] already stamped", {
        credit_note_id,
        uuid: initialNcRow.cfdi_uuid,
      });
      return json({ error: "Credit note already stamped" }, 409, jsonHeaders);
    }
    // Claim + snapshot atómicos: la RPC bloquea la fila, cambia a stamping y
    // devuelve exactamente el contenido fiscal que se enviará al PAC.
    if (!supabase.rpc) {
      return json(
        { error: "Credit note claim RPC unavailable" },
        500,
        jsonHeaders,
      );
    }
    const claimRes = await supabase.rpc("claim_credit_note_for_stamping", {
      p_credit_note_id: credit_note_id,
    });
    if (claimRes.error) {
      console.error("[stamp-credit-note] claim RPC failed", {
        credit_note_id,
        error: claimRes.error,
      });
      return json({ error: "Could not claim credit note" }, 500, jsonHeaders);
    }
    if (!claimRes.data) {
      console.error(
        "[stamp-credit-note] claim failed — concurrent stamp or unexpected status",
        { credit_note_id, current_status: initialNcRow.cfdi_status },
      );
      return json(
        { error: "Credit note already stamped or in progress" },
        409,
        jsonHeaders,
      );
    }
    const ncRow = claimRes.data as Record<string, unknown>;
    claimed = true;

    // BL-03: helper para revertir claim atómico si algo falla antes de timbrar.
    // R9-13: `.eq("cfdi_status", "stamping")` hace la salida CONDICIONAL — si
    // el estado ya avanzó (p. ej. el PAC emitió y otro camino ya lo persistió)
    // este UPDATE no lo pisa.
    const releaseClaim = async (errorMessage?: string) => {
      await supabase
        .from("credit_notes")
        .update({
          cfdi_status: errorMessage ? "error" : "pending",
          ...(errorMessage
            ? { cfdi_error_message: errorMessage.slice(0, 1000) }
            : {}),
        })
        .eq("id", credit_note_id)
        .eq("cfdi_status", "stamping");
    };

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", ncRow.invoice_id)
      .single();
    if (invErr || !invoice) {
      console.error("[stamp-credit-note] source invoice not found", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
      });
      await releaseClaim("Source invoice not found");
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }
    const inv = invoice as Record<string, unknown>;
    if (
      inv.cfdi_status !== "stamped" ||
      !inv.facturapi_invoice_id ||
      !inv.cfdi_uuid
    ) {
      console.error("[stamp-credit-note] source invoice not stamped", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
        inv_cfdi_status: inv.cfdi_status,
      });
      await releaseClaim("Source invoice must be stamped");
      return json(
        { error: "Source invoice must be stamped" },
        400,
        jsonHeaders,
      );
    }

    // A-01: el borrador no es fuente de verdad fiscal. Cada línea debe apuntar
    // una sola vez a una línea real de la factura timbrada; identidad SAT,
    // descuento e IVA se derivan de esa fuente. También se recalculan los tres
    // totales antes de cualquier modo stub o llamada a Facturapi.
    const sourceValidation = validateCreditNoteSourceLines(ncRow, inv);
    if (!sourceValidation.ok) {
      await releaseClaim(sourceValidation.message);
      return json(
        {
          error: sourceValidation.message,
          code: sourceValidation.code,
          recreate_required: sourceValidation.recreateRequired,
        },
        422,
        jsonHeaders,
      );
    }

    // BL-08: validación server-side anti-sobre-acreditación. Sumamos TODAS las NCs
    // de esta factura que no estén canceladas (stamped + pending + stamping + error).
    // Como el claim atómico ya movió esta NC a "stamping", queda incluida en la suma.
    const { data: siblingNcs } = await supabase
      .from("credit_notes")
      .select("id, total, cfdi_status, cancellation_status, status")
      .eq("invoice_id", ncRow.invoice_id);
    const activeNcTotal = ((siblingNcs ?? []) as Array<Record<string, unknown>>)
      .filter(
        (n) => n.cancellation_status !== "accepted" && n.status !== "cancelled",
      )
      .reduce((s, n) => s + Number(n.total ?? 0), 0);
    const invoiceTotal = Number(inv.total ?? 0);
    if (activeNcTotal - 0.01 > invoiceTotal) {
      await releaseClaim(
        `Notas de crédito acumuladas (${activeNcTotal.toFixed(
          2,
        )}) exceden el total facturado (${invoiceTotal.toFixed(2)}).`,
      );
      return json(
        {
          error: `El monto total de notas de crédito excede el importe de la factura. Suma NCs: ${activeNcTotal.toFixed(
            2,
          )} > factura ${invoiceTotal.toFixed(2)}.`,
        },
        400,
        jsonHeaders,
      );
    }

    // BL-16: modo Facturapi debe ser el de la compañía (test/live) para que la NC
    // se timbre en el mismo ambiente que la factura origen.
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const modeOverride = (company as Record<string, unknown> | null)
      ?.facturapi_mode as string | undefined | null;
    const { apiKey, mode } = await getFacturapiConfig(supabase, deps.env, {
      modeOverride: modeOverride ?? null,
    });

    if (!apiKey) {
      // BL-20: no marcar como timbrada una NC en modo live sin API key.
      if (mode === "live") {
        await releaseClaim(
          "Facturapi API key no configurada para modo live. No se emitió CFDI de la NC.",
        );
        return json(
          {
            error:
              "Facturapi API key no configurada para modo live. Configura la key antes de timbrar la nota de crédito.",
          },
          400,
          jsonHeaders,
        );
      }
      const mockUuid = crypto.randomUUID();
      await supabase
        .from("credit_notes")
        .update({
          cfdi_uuid: mockUuid,
          cfdi_status: "stamped",
          status: "stamped",
        })
        .eq("id", credit_note_id);
      return json(
        { success: true, cfdi_uuid: mockUuid, stub: true },
        200,
        jsonHeaders,
      );
    }

    const client = createFacturapiClient(apiKey);

    const items = sourceValidation.lines.map((li) => {
      const item: Record<string, unknown> = {
        product: {
          // A-01: identidad fiscal y tasa vienen siempre de invoices.line_items,
          // nunca de los JSON editables de la nota de crédito.
          description: li.description,
          product_key: li.productKey,
          unit_key: li.unitKey,
          price: li.unitPrice,
          tax_included: false,
          taxes:
            li.objetoImp === "01"
              ? []
              : [{ type: "IVA", rate: li.taxRatePct / 100 }],
        },
        quantity: li.quantity,
      };

      if (li.discountAmount > 0) {
        item.discount = roundMoney(li.discountAmount);
      }
      return item;
    });

    const legalName = sanitizeLegalName(
      String(
        inv.receptor_razon_social || inv.customer_name || "Público General",
      ),
    );

    const taxId = String(inv.receptor_rfc || "XAXX010101000").toUpperCase();
    // Residual (a): los defaults "616"/"06600" timbraban la NC con datos
    // fiscales genéricos. Se exigen los datos reales del receptor salvo en el
    // CFDI global (RFC genérico XAXX010101000).
    const isGlobalReceptor = taxId === "XAXX010101000";
    // R8-06: el receptor global siempre timbra con el código puro "616".
    const taxSystem = resolveReceptorRegimenFiscal(
      isGlobalReceptor,
      inv.receptor_regimen_fiscal as string | null | undefined,
    );

    const zip = isGlobalReceptor
      ? String(inv.receptor_domicilio_fiscal_cp || "06600")
      : String(inv.receptor_domicilio_fiscal_cp ?? "").trim();

    // A4-05: dígito verificador del RFC validado también en el servidor.
    const ncRfcError = validateRfcOrMessage(taxId);
    if (ncRfcError) {
      await releaseClaim(ncRfcError);
      return json({ error: ncRfcError }, 400, jsonHeaders);
    }

    if (!isGlobalReceptor) {
      const missingFiscal: string[] = [];
      if (!taxSystem) missingFiscal.push("régimen fiscal del receptor");
      if (!zip) missingFiscal.push("código postal fiscal del receptor");
      if (missingFiscal.length > 0) {
        const msg = `Faltan datos fiscales del receptor: ${missingFiscal.join(
          ", ",
        )}. Captúralos en el cliente o en la factura antes de timbrar.`;
        await releaseClaim(msg);
        return json({ error: msg }, 400, jsonHeaders);
      }
      // R7-03: el fail-fast de régimen fiscal (A4B-08) también aplica aquí;
      // antes la NC enviaba el valor crudo (p. ej. "601 - General de Ley…").
      if (!isValidRegimenFiscalCode(taxSystem)) {
        const msg = `El régimen fiscal del receptor "${taxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en la factura origen (o en el cliente y vuelve a generar el borrador) antes de timbrar.`;
        await releaseClaim(msg);
        return json({ error: msg }, 422, jsonHeaders);
      }
    }

    // BL-16: propagar payment_method y exchange reales de la factura origen.
    // Antes se hardcodeaba PUE + exchange 1: NC sobre PPD emitía documento no
    // relacionable ante el SAT; NC sobre USD ignoraba tipo de cambio.
    const invPaymentMethod = String(inv.metodo_pago || "PUE");
    // R9-02: gate canónico de tipo de cambio ANTES de llamar al PAC. El viejo
    // fallback `|| 1` timbraba NC en moneda foránea con paridad 1:1 falsa.
    const fxCurrency = (ncRow.currency ?? inv.moneda ?? "MXN") as
      string | null | undefined;
    const fxGate = checkStampFx(
      fxCurrency,
      inv.tipo_cambio as number | string | null | undefined,
    );
    if (!fxGate.ok) {
      await releaseClaim(fxGate.message);
      return json({ error: fxGate.message }, 422, jsonHeaders);
    }
    const invCurrency = fxGate.currency;
    const invExchange = fxGate.exchange;

    const payload: Record<string, unknown> = {
      type: "E",
      use: "G02",
      // H5: external_id = credit_note_id. Si el PAC timbra pero la respuesta
      // se pierde (timeout), reconcile-stamping-invoices recupera el CFDI de
      // egreso por external_id en vez de dejar la NC atascada o re-timbrar.
      external_id: credit_note_id as string,
      customer: {
        legal_name: legalName,
        tax_id: taxId,
        tax_system: taxSystem,
        address: { zip },
      },
      items,
      payment_form: inv.forma_pago || "99",
      payment_method: invPaymentMethod,
      currency: invCurrency,
      exchange: invExchange,
      related_documents: [
        {
          relationship: "01",
          documents: [String(inv.cfdi_uuid)],
        },
      ],
    };

    let fa: {
      id: string;
      uuid: string;
      folio_number?: number | string | null;
    };
    try {
      fa = (await sdkCallWithTimeout((signal) =>
        createInvoiceWithSignal(client, payload, { signal }),
      )) as {
        id: string;
        uuid: string;
        folio_number?: number | string | null;
      };
    } catch (err) {
      // ARQ2-A1: timeout → NO revertir estado local (dejar en `stamping` para reconcile).
      if (isFacturapiTimeout(err)) {
        console.warn("[stamp-credit-note] facturapi timeout", {
          credit_note_id,
        });
        return jsonResponse(
          req,
          {
            error: "PAC no respondió a tiempo, reintenta",
            code: "TIMEOUT",
            transient: true,
          },
          { status: 504 },
        );
      }
      const desc = describeFacturapiError(err);
      console.error("[stamp-credit-note] facturapi rejected", {
        credit_note_id,
        status: desc.status,
        code: desc.code,
        message: desc.message,
      });
      // R9-13: este catch sólo se alcanza cuando la LLAMADA al PAC rechazó o
      // falló (p. ej. 4xx de validación) — Facturapi nunca confirmó emisión,
      // así que es seguro marcar 'error' y permitir reintento. `.eq` condicional
      // por si algo más avanzó el estado en paralelo.
      await supabase
        .from("credit_notes")
        .update({
          cfdi_status: "error",
          cfdi_error_message: desc.detail.slice(0, 1000),
        })
        .eq("id", credit_note_id)
        .eq("cfdi_status", "stamping");
      return json(
        { error: `Facturapi error: ${desc.status}`, detail: desc.detail },
        502,
        jsonHeaders,
      );
    }

    // R9-13: a partir de aquí Facturapi YA EMITIÓ el CFDI de egreso ante el
    // SAT. Cualquier falla posterior (persistencia, red, excepción inesperada)
    // NO puede tratarse como "nunca se timbró": el outer-catch usa estas
    // referencias para dejar la NC en 'stamping' (reconciliable) en vez de
    // reabrirla para un reintento que duplicaría el timbre.
    pacEmitted = true;
    const facturApiId = fa.id;
    const cfdiUuid = fa.uuid;
    emittedFacturapiId = facturApiId;
    emittedCfdiUuid = cfdiUuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xml = await binaryToText(
        await client.invoices.downloadXml(facturApiId),
      );
      const path = `credit-notes/${credit_note_id}/${cfdiUuid}.xml`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, new Blob([xml], { type: "application/xml" }), {
          contentType: "application/xml",
          upsert: true,
        });
      if (!upErr) xmlPath = path;
      else {
        console.error("[stamp-credit-note] archive xml upload failed", {
          credit_note_id,
          err: upErr,
        });
      }
    } catch (e) {
      console.error("[stamp-credit-note] archive xml failed", {
        credit_note_id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      const bytes = await binaryToBytes(
        await client.invoices.downloadPdf(facturApiId),
      );
      const path = `credit-notes/${credit_note_id}/${cfdiUuid}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (!upErr) pdfPath = path;
      else {
        console.error("[stamp-credit-note] archive pdf upload failed", {
          credit_note_id,
          err: upErr,
        });
      }
    } catch (e) {
      console.error("[stamp-credit-note] archive pdf failed", {
        credit_note_id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    // A1-B3 (residual): reconciliación de varianza, espejo de BL-A5 en
    // stamp-cfdi. Si el total del CFDI de egreso no coincide con
    // `credit_notes.total`, se persiste la identidad fiscal (el CFDI ya existe
    // ante el SAT y debe poder cancelarse) pero con `cfdi_status='error'`.
    const stampedTotal = (fa as { total?: unknown }).total;
    const varianceCheck = computeStampVariance(ncRow.total, stampedTotal);
    const hasVariance = Boolean(
      varianceCheck && !varianceCheck.withinTolerance,
    );
    const varianceMessage =
      hasVariance && varianceCheck
        ? `Error BL-A5: el total timbrado (${Number(stampedTotal).toFixed(
            2,
          )}) difiere del total de la nota de crédito (${Number(
            ncRow.total,
          ).toFixed(2)}); varianza ${varianceCheck.variance.toFixed(
            2,
          )}. El CFDI de egreso existe ante el SAT: cancélalo y corrige tasas/descuentos.`
        : null;
    if (hasVariance && varianceCheck) {
      console.error("[stamp-credit-note] BL-A5 stamp variance detectada", {
        credit_note_id,
        credit_note_total: ncRow.total,
        stamped_total: stampedTotal,
        variance: varianceCheck.variance,
      });
    }

    // R9-13: `.eq("cfdi_status","stamping")` — salida condicional del estado
    // en curso; no pisa un estado que ya haya avanzado por otro camino
    // (p. ej. reconcile-stamping-invoices llegó primero tras un timeout).
    const updRes = await supabase
      .from("credit_notes")
      .update({
        facturapi_invoice_id: facturApiId,
        cfdi_uuid: cfdiUuid,
        cfdi_status: hasVariance ? "error" : "stamped",
        ...(hasVariance ? {} : { status: "stamped" }),
        cfdi_xml_url: xmlPath,
        cfdi_pdf_url: pdfPath,
        cfdi_error_message: varianceMessage,
        ...(varianceCheck
          ? {
              stamp_variance: varianceCheck.variance,
              stamp_variance_checked_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", credit_note_id)
      .eq("cfdi_status", "stamping");

    const updErr = (updRes as { error: unknown }).error;
    if (updErr) {
      // R9-13: el CFDI YA EXISTE ante el SAT (facturApiId/cfdiUuid) pero la
      // persistencia local falló. NO se toca cfdi_status (sigue en
      // 'stamping'): reconcile-stamping-invoices la recuperará por
      // facturapi_invoice_id/external_id. Reintentar el timbrado aquí
      // produciría un segundo CFDI de egreso duplicado.
      console.error("[stamp-credit-note] DB update failed after stamp", {
        credit_note_id,
        cfdiUuid,
        facturApiId,
      });
      return json(
        {
          error:
            "El CFDI se timbró pero no se pudo guardar en la base de datos. Se reconciliará automáticamente; no reintentes el timbrado manualmente.",
          cfdi_uuid: cfdiUuid,
          reconciling: true,
        },
        502,
        jsonHeaders,
      );
    }

    if (hasVariance) {
      return json(
        {
          error:
            varianceMessage ??
            "Stamp variance exceeds tolerance; credit note not stamped",
          cfdi_uuid: cfdiUuid,
        },
        502,
        jsonHeaders,
      );
    }

    // Folio diferido: si el credit_note_number sigue siendo placeholder
    // BORRADOR-NC-XXXX y Facturapi devolvió folio, promovemos a NC-<folio>.
    // Facturapi es la fuente de verdad para mantener 1:1 con su serie.
    let finalCreditNoteNumber: string | null = null;
    const currentNcNum = (ncRow.credit_note_number as string | null) ?? null;
    const facturApiFolioRaw = fa.folio_number ?? null;
    const facturApiFolio: string | null =
      facturApiFolioRaw !== null && facturApiFolioRaw !== undefined
        ? String(facturApiFolioRaw)
        : null;

    if (
      facturApiFolio &&
      currentNcNum &&
      currentNcNum.startsWith("BORRADOR-NC-")
    ) {
      const rpcRes = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("assign_stamped_credit_note_number", {
        p_credit_note_id: credit_note_id,
        p_folio: facturApiFolio,
      });
      const rpcErr = rpcRes.error as { message?: string } | null;
      if (rpcErr) {
        console.error(
          "[stamp-credit-note] assign_stamped_credit_note_number failed",
          { credit_note_id, err: rpcErr.message },
        );
      } else {
        finalCreditNoteNumber = rpcRes.data as string;
      }
    }

    return json(
      {
        success: true,
        cfdi_uuid: cfdiUuid,
        facturapi_invoice_id: facturApiId,
        credit_note_number: finalCreditNoteNumber ?? currentNcNum,
      },
      200,
      jsonHeaders,
    );
  } catch (err) {
    console.error("[stamp-credit-note] unhandled exception", {
      credit_note_id,
      userId,
      pacEmitted,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // BL-03 (cierre) + R9-13: liberar el claim atómico ante excepción no
    // manejada — PERO sólo cuando el PAC nunca confirmó emisión. Si
    // `pacEmitted` es true, el CFDI de egreso ya existe ante el SAT y
    // marcar 'error' (re-timbrable) produciría un doble timbrado. En ese
    // caso dejamos la NC en 'stamping' con la evidencia que se alcanzó a
    // capturar para que `reconcile-stamping-invoices` la reconcilie.
    if (claimed && supabaseRef && credit_note_id) {
      try {
        if (pacEmitted) {
          await supabaseRef
            .from("credit_notes")
            .update({
              // No tocamos cfdi_status (permanece 'stamping' = reconciliable).
              ...(emittedFacturapiId
                ? { facturapi_invoice_id: emittedFacturapiId }
                : {}),
              ...(emittedCfdiUuid ? { cfdi_uuid: emittedCfdiUuid } : {}),
              cfdi_error_message:
                "CFDI emitido en Facturapi pero la persistencia local falló tras una excepción inesperada. Pendiente de reconciliación automática.",
            })
            .eq("id", credit_note_id)
            .eq("cfdi_status", "stamping");
        } else {
          // Camino seguro: el PAC nunca fue invocado o falló antes de emitir.
          await supabaseRef
            .from("credit_notes")
            .update({
              cfdi_status: "error",
              cfdi_error_message: "Internal error during stamping",
            })
            .eq("id", credit_note_id)
            .eq("cfdi_status", "stamping");
        }
      } catch (releaseErr) {
        console.error("[stamp-credit-note] release-on-exception failed", {
          credit_note_id,
          err:
            releaseErr instanceof Error
              ? releaseErr.message
              : String(releaseErr),
        });
      }
    }
    if (pacEmitted) {
      return json(
        {
          error:
            "El CFDI se timbró pero ocurrió un error interno al finalizar. Se reconciliará automáticamente; no reintentes el timbrado manualmente.",
          reconciling: true,
        },
        502,
      );
    }
    return json({ error: "Internal server error" }, 500);
  }
}
