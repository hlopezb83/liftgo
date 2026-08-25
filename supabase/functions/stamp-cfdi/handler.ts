// Pure handler for stamp-cfdi, deps-injected for testability.
// The Deno.serve entry in index.ts wires real createClient + fetch + env.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import type { QueryBuilderLike, SupabaseLike } from "../_shared/types.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  createInvoiceWithSignal,
  describeFacturapiError,
  getFacturapiConfig,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
} from "../_shared/cfdiRetryQueue.ts";
import {
  computeStampVariance,
  roundMoney,
  STAMP_VARIANCE_WARNING as STAMP_VARIANCE_TOLERANCE,
} from "../_shared/money.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";

// Re-exports públicos preservados (tests + consumidores).
export { computeStampVariance, sanitizeLegalName, STAMP_VARIANCE_TOLERANCE };
export type { QueryBuilderLike, SupabaseLike };

// Mantenido por compatibilidad con consumidores existentes.
export const FACTURAPI_BASE = "https://www.facturapi.io/v2";

export interface StampCfdiDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (key: string) => string | undefined;
}

export async function handleStampCfdi(
  req: Request,
  deps: StampCfdiDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number, _headers?: unknown) =>
    jsonResponse(req, body, { status });
  const jsonHeaders = undefined;

  // Referencias externas al try para que el outer-catch pueda liberar el claim
  // atómico ante excepciones inesperadas (BL-03 cierre completo).
  let supabaseRef: SupabaseLike | null = null;
  let invoiceIdRef: string | null = null;
  let claimed = false;
  // EC-A2: si Facturapi ya emitió el CFDI, no queremos que el outer-catch
  // resetee la factura a 'error' — quedaría en un estado imposible (UUID +
  // error). Mejor dejar en 'stamping' para que `reconcile-stamping-invoices`
  // la recupere.
  let cfdiPersisted = false;

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[stamp-cfdi]",
    });
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status, jsonHeaders);
    }
    const supabase = auth.supabase;
    supabaseRef = supabase;

    const body = await req.json().catch(() => ({}));
    const { invoice_id } = body as { invoice_id?: unknown };

    if (!isUUID(invoice_id)) {
      console.error("[stamp-cfdi] invalid invoice_id");
      return json(
        { error: "invoice_id must be a valid UUID" },
        400,
        jsonHeaders,
      );
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).single();

    if (invErr || !invoice) {
      console.error("[stamp-cfdi] invoice not found", { invoice_id });
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }

    const inv = invoice as Record<string, unknown>;

    if (inv.is_e2e === true) {
      console.error("[stamp-cfdi] e2e invoice rejected", { invoice_id });
      return json(
        { error: "E2E invoices cannot be stamped" },
        403,
        jsonHeaders,
      );
    }

    // Guard de idempotencia (chequeo rápido — solo evita pagar Facturapi):
    if (inv.cfdi_status === "stamped" && inv.cfdi_uuid) {
      console.error("[stamp-cfdi] already stamped", {
        invoice_id,
        uuid: inv.cfdi_uuid,
      });
      return json(
        { error: "Invoice already stamped", cfdi_uuid: inv.cfdi_uuid },
        409,
        jsonHeaders,
      );
    }

    // Claim atómico: solo una petición concurrente puede pasar de
    // pending|error → stamping. Cierra la ventana entre el SELECT anterior
    // y la llamada a Facturapi para evitar doble timbrado.
    const claimRes = await supabase
      .from("invoices")
      .update({ cfdi_status: "stamping" })
      .eq("id", invoice_id)
      .in("cfdi_status", ["pending", "error"])
      .is("cfdi_uuid", null)
      .select("id")
      .maybeSingle();
    const claimedRow = (claimRes as { data: unknown }).data;
    if (!claimedRow) {
      console.error(
        "[stamp-cfdi] claim failed — concurrent stamp in progress",
        {
          invoice_id,
        },
      );
      return json(
        { error: "Invoice already stamped or in progress" },
        409,
        jsonHeaders,
      );
    }
    claimed = true;
    invoiceIdRef = invoice_id as string;

    // Helper para revertir el claim atómico ante cualquier salida temprana
    // posterior al UPDATE→stamping. Sin esto la factura queda atascada en
    // "stamping" para siempre (BL-03).
    const releaseClaim = async (errorMessage?: string) => {
      await supabase.from("invoices")
        .update({
          cfdi_status: errorMessage ? "error" : "pending",
          ...(errorMessage
            ? { cfdi_error_message: errorMessage.slice(0, 1000) }
            : {}),
        })
        .eq("id", invoice_id);
    };

    const { data: company } = await supabase
      .from("company_settings").select("*").limit(1).maybeSingle();
    if (!company) {
      console.error("[stamp-cfdi] company_settings missing", { invoice_id });
      await releaseClaim("Company settings not configured");
      return json(
        { error: "Company settings not configured" },
        400,
        jsonHeaders,
      );
    }
    const co = company as Record<string, unknown>;
    const { apiKey, mode } = await getFacturapiConfig(supabase, deps.env, {
      modeOverride: (co.facturapi_mode as string | undefined) ?? null,
    });

    if (!apiKey) {
      // BL-20: rechazar timbrado stub en modo live sin API key configurada.
      // Marcar como "stamped" un documento que no existe ante el SAT es
      // peligroso — puede pasar años sin detectarse.
      if (mode === "live") {
        await releaseClaim(
          "Facturapi API key no configurada para modo live. No se emitió CFDI.",
        );
        return json(
          {
            error:
              "Facturapi API key no configurada para modo live. Configura la key antes de timbrar.",
          },
          400,
          jsonHeaders,
        );
      }
      const mockUuid = crypto.randomUUID();
      const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="${inv.serie || ""}" Folio="${inv.folio || ""}"
  Fecha="${new Date().toISOString()}"
  SubTotal="${inv.subtotal}" Total="${inv.total}">
  <tfd:TimbreFiscalDigital UUID="${mockUuid}" />
</cfdi:Comprobante>`;

      await supabase.from("invoices")
        .update({
          cfdi_uuid: mockUuid,
          cfdi_xml: mockXml,
          cfdi_status: "stamped",
          facturapi_env: "test",
          ...(inv.status === "draft" ? { status: "sent" } : {}),
        })
        .eq("id", invoice_id);

      return json(
        { success: true, cfdi_uuid: mockUuid, stub: true },
        200,
        jsonHeaders,
      );
    }

    const client = createFacturapiClient(apiKey);

    // BL-01: distinguir tasa cero legítima (0) de "no capturada" (null/undefined).
    const taxRatePct = typeof inv.tax_rate === "number" ? inv.tax_rate : 16;
    
    const items = Array.isArray(inv.line_items)
      ? (inv.line_items as Array<
        {
          description?: string;
          quantity?: number;
          unit_price?: number;
          // M19: los line_items persisten las claves SAT con estos nombres
          // (ver invoiceFormBuilders.ts / nonRentalLines.ts). `product_key`
          // NUNCA existió: todo timbraba con el genérico 78101803.
          clave_prod_serv?: string;
          clave_unidad?: string;
          objeto_imp?: string;
          tax_rate?: number;
          discount?: number;
          discount_type?: "%" | "$";
        }
      >).map((li) => {
        const quantity = li.quantity || 1;
        const unitPrice = li.unit_price || 0;
        const objetoImp = li.objeto_imp ?? "02";
        // C-1: tasa por línea con fallback línea → factura (taxRatePct ya
        // cae a 16 cuando invoices.tax_rate no es numérico), igual que
        // `computeTotals` en src/lib/domain/invoiceTotals.ts.
        const lineRatePct =
          typeof li.tax_rate === "number" && Number.isFinite(li.tax_rate)
            ? li.tax_rate
            : taxRatePct;
        const lineRateFraction = lineRatePct / 100;
        const item: Record<string, unknown> = {
          product: {
            description: li.description || "Servicio de renta",
            product_key: li.clave_prod_serv || "78101803",
            unit_key: li.clave_unidad || "E48",
            price: unitPrice,
            tax_included: false,
            // M19: ObjetoImp 01 = no objeto de impuesto → línea sin traslados.
            taxes: objetoImp === "01"
              ? []
              : [{ type: "IVA", rate: lineRateFraction }],
          },
          quantity,
        };
        // BL-02: propagar descuento al CFDI. Facturapi acepta `discount` como
        // monto absoluto por línea (antes de impuestos). Convertimos porcentaje
        // a monto para que el XML timbrado coincida con el total de la app.
        if (li.discount && li.discount > 0) {
          const base = unitPrice * quantity;
          // S2-2.2: el porcentaje se capea en [0,100] igual que
          // `applyDiscountToBase` en src/lib/domain/invoiceTotals.ts.
          const discountPct = Math.min(100, Math.max(0, li.discount ?? 0));
          const discountAmount = li.discount_type === "$"
            ? Math.min(li.discount, base)
            : (base * discountPct) / 100;
          if (discountAmount > 0) {
            // BL-A5: `roundMoney` (2 decimales, centavos enteros) reemplaza el
            // `Math.round(*100)/100` histórico para eliminar drift IEEE-754.
            item.discount = roundMoney(discountAmount);
          }
        }

        return item;
      })
      : [];

    const receptorRfc = String(inv.receptor_rfc ?? "XAXX010101000")
      .toUpperCase();
    const isGlobal = receptorRfc === "XAXX010101000";

    // Overrides fiscales obligatorios para Público en General (CFDI 4.0)
    const paymentMethod = isGlobal ? "PUE" : (inv.metodo_pago || "PUE");
    // SAT CFDI 4.0: cuando metodo_pago = PPD, forma_pago DEBE ser "99" (Por definir)
    const paymentForm = isGlobal
      ? "01"
      : (paymentMethod === "PPD" ? "99" : (inv.forma_pago || "99"));
    const usoCfdi = isGlobal ? "S01" : (inv.uso_cfdi || "G03");
    const legalName = isGlobal ? "PUBLICO EN GENERAL" : sanitizeLegalName(
      String(
        inv.receptor_razon_social ?? inv.customer_name ?? "Público General",
      ),
    );
    const taxSystem = isGlobal ? "616" : (inv.receptor_regimen_fiscal || "616");

    if (isGlobal) {
      const missing: string[] = [];
      if (!inv.global_periodicity) missing.push("periodicidad");
      if (!inv.global_months) missing.push("meses");
      if (!inv.global_year) missing.push("año");
      if (missing.length > 0) {
        // BL-03: revertir claim antes de salir para que la factura pueda re-timbrarse.
        await releaseClaim(
          `Faltan datos de Información Global: ${missing.join(", ")}`,
        );
        return json(
          {
            error: `Faltan datos de Información Global (Público en General): ${
              missing.join(", ")
            }. Captúralos en el formulario de la factura antes de timbrar.`,
          },
          400,
          jsonHeaders,
        );
      }
    }

    // S2-2.1: moneda foránea sin tipo de cambio válido → 422 sin llamar al PAC.
    // El SAT exige TipoCambio > 0 cuando Moneda != MXN; el viejo fallback
    // `|| 1` timbraba con paridad 1:1 y falseaba los importes en pesos.
    const moneda = String(inv.moneda ?? "MXN").toUpperCase();
    const tipoCambio = typeof inv.tipo_cambio === "number"
      ? inv.tipo_cambio
      : Number(inv.tipo_cambio ?? NaN);
    if (moneda !== "MXN" && (!Number.isFinite(tipoCambio) || tipoCambio <= 0)) {
      await releaseClaim(`Factura en ${moneda} sin tipo de cambio`);
      return json(
        {
          error:
            `La factura en ${moneda} no tiene tipo de cambio válido. Captura el tipo de cambio antes de timbrar.`,
        },
        422,
        jsonHeaders,
      );
    }

    const payload: Record<string, unknown> = {
      type: "I",
      customer: {
        legal_name: legalName,
        tax_id: receptorRfc,
        tax_system: taxSystem,
        address: { zip: inv.receptor_domicilio_fiscal_cp || "06600" },
      },
      items,
      payment_form: paymentForm,
      payment_method: paymentMethod,
      use: usoCfdi,
      currency: moneda,
      exchange: moneda === "MXN" ? 1 : tipoCambio,
      series: inv.serie || undefined,

      // BL-20: validar folio numérico antes de castear (Number("BORRADOR")=NaN
      // rompía el payload JSON hacia Facturapi).
      folio_number: (() => {
        if (!inv.folio) return undefined;
        const n = Number(inv.folio);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      // R12 B2: external_id permite que `reconcile-stamping-invoices` recupere
      // el CFDI vía `invoices.list({ q })` cuando el timeout impidió persistir
      // facturapi_invoice_id — evita re-timbrar y por ende un CFDI duplicado.
      external_id: invoice_id as string,
    };

    if (isGlobal) {
      const PERIODICITY_MAP: Record<string, string> = {
        "01": "day",
        "02": "week",
        "03": "fortnight",
        "04": "month",
        "05": "two_months",
      };
      const FACTURAPI_ENUM = new Set([
        "day",
        "week",
        "fortnight",
        "month",
        "two_months",
      ]);
      const raw = String(inv.global_periodicity);
      const periodicity = PERIODICITY_MAP[raw] ??
        (FACTURAPI_ENUM.has(raw) ? raw : null);
      if (!periodicity) {
        // BL-03: revertir claim antes de propagar error — antes se lanzaba y la
        // factura quedaba atascada en "stamping".
        const msg =
          `Periodicidad global inválida: "${raw}". Debe ser código SAT 01-05.`;
        await releaseClaim(msg);
        return json({ error: msg }, 400, jsonHeaders);
      }
      payload.global = {
        periodicity,
        months: String(inv.global_months),
        year: Number(inv.global_year),
      };
    }

    let facturApiInvoice: { id: string; uuid: string };
    // EC-A2: timeout hard-cap con AbortController (abort real del fetch en
    // vuelo). Sin abort, Promise.race resolvía TIMEOUT pero la petición seguía
    // consumiendo cuota; si Facturapi alcanzaba a emitir el CFDI, un reintento
    // ciego duplicaba el timbre. Con el abort la petición muere aquí; si aun
    // así el CFDI se emitió (respuesta en tránsito), la factura queda en
    // `stamping` (NO 'error', SIN retry) y `reconcile-stamping-invoices` la
    // resuelve vía folio/serie.
    const FACTURAPI_TIMEOUT_MS = 30_000;
    const stampAbort = new AbortController();
    let rejectOnTimeout!: (err: unknown) => void;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectOnTimeout = reject;
    });
    const stampTimeoutId = setTimeout(() => {
      stampAbort.abort(new Error("Facturapi request timed out"));
      rejectOnTimeout(
        Object.assign(new Error("Facturapi request timed out"), {
          status: 504,
          code: "TIMEOUT",
        }),
      );
    }, FACTURAPI_TIMEOUT_MS);
    try {
      facturApiInvoice = await Promise.race([
        createInvoiceWithSignal(client, payload, { signal: stampAbort.signal }),
        timeoutPromise,
      ]) as { id: string; uuid: string };
    } catch (err) {
      const desc = describeFacturapiError(err);
      const isTimeout = (desc as { code?: string }).code === "TIMEOUT" ||
        (err as { code?: string })?.code === "TIMEOUT";
      console.error("[stamp-cfdi] facturapi rejected", {
        invoice_id,
        status: desc.status,
        code: desc.code,
        message: desc.message,
        timeout: isTimeout,
      });
      // Verificación §3: en TIMEOUT NO reseteamos la fila a `error` ni
      // encolamos retry. El request a Facturapi puede haber completado
      // server-side; un retry ciego crearía un CFDI duplicado ante el SAT.
      // La dejamos en `stamping` (el claim se preserva) para que
      // `reconcile-stamping-invoices` la resuelva vía folio/serie o la
      // revierta a `error` con nota manual si Facturapi no emitió nada.
      if (isTimeout) {
        return json(
          {
            error: "Facturapi timeout — reconciliación en curso",
            code: "TIMEOUT",
            status: 504,
            detail: desc.detail,
            transient: true,
          },
          504,
          jsonHeaders,
        );
      }
      await supabase.from("invoices")
        .update({
          cfdi_status: "error",
          cfdi_error_message: desc.detail.slice(0, 1000),
        })
        .eq("id", invoice_id);
      // BL-44: encolar reintento solo si el error es transitorio (5xx / red / 429).
      if (isTransientFacturapiError(desc)) {
        await enqueueCfdiRetry(supabase, {
          operation: "stamp",
          invoiceId: invoice_id,
          payload: { body },
          errorMessage: `${desc.code ?? ""} ${desc.message}`.trim(),
        });
      }
      const errorText = desc.code
        ? `${desc.code}: ${desc.message}`
        : desc.message;
      return json(
        {
          error: errorText,
          code: desc.code,
          status: desc.status,
          detail: desc.detail,
          transient: isTransientFacturapiError(desc),
        },
        502,
        jsonHeaders,
      );
    } finally {
      clearTimeout(stampTimeoutId);
    }

    const facturApiId = facturApiInvoice.id;
    const cfdiUuid = facturApiInvoice.uuid;
    const facturApiSeries: string | null =
      (facturApiInvoice as { series?: string | null }).series ?? null;
    const facturApiFolioRaw =
      (facturApiInvoice as { folio_number?: number | string | null })
        .folio_number ?? null;
    const facturApiFolio: string | null = facturApiFolioRaw !== null &&
        facturApiFolioRaw !== undefined
      ? String(facturApiFolioRaw)
      : null;

    // EC-A2: persistir de inmediato facturapi_invoice_id + cfdi_uuid.
    // A partir de aquí, si algo falla (descarga XML/PDF, storage, UPDATE final),
    // la factura queda recuperable por `reconcile-stamping-invoices` sin
    // riesgo de emitir un CFDI duplicado en Facturapi.
    await supabase.from("invoices").update({
      facturapi_invoice_id: facturApiId,
      cfdi_uuid: cfdiUuid,
      facturapi_env: mode === "live" ? "live" : "test",
    }).eq("id", invoice_id);
    cfdiPersisted = true;

    let cfdiXml: string | null = null;
    let xmlStoragePath: string | null = null;
    let pdfStoragePath: string | null = null;

    try {
      cfdiXml = await binaryToText(
        await retryOnFacturapi5xx(() =>
          client.invoices.downloadXml(facturApiId)
        ),
      );
      const path = `${invoice_id}/${cfdiUuid}.xml`;
      const { error: upErr } = await supabase.storage.from("cfdi-files")
        .upload(
          path,
          new Blob([cfdiXml], { type: "application/xml" }),
          { contentType: "application/xml", upsert: true },
        );
      if (!upErr) xmlStoragePath = path;
      else {console.error("[stamp-cfdi] archive xml upload failed", {
          invoice_id,
          err: upErr,
        });}
    } catch (err) {
      console.error("[stamp-cfdi] archive xml failed", {
        invoice_id,
        err: describeFacturapiError(err),
      });
    }

    try {
      const pdfBytes = await binaryToBytes(
        await retryOnFacturapi5xx(() =>
          client.invoices.downloadPdf(facturApiId)
        ),
      );
      const path = `${invoice_id}/${cfdiUuid}.pdf`;
      const { error: upErr } = await supabase.storage.from("cfdi-files")
        .upload(
          path,
          pdfBytes,
          { contentType: "application/pdf", upsert: true },
        );
      if (!upErr) pdfStoragePath = path;
      else {console.error("[stamp-cfdi] archive pdf upload failed", {
          invoice_id,
          err: upErr,
        });}
    } catch (err) {
      console.error("[stamp-cfdi] archive pdf failed", {
        invoice_id,
        err: describeFacturapiError(err),
      });
    }

    // BL-A5 (C-1): reconciliación del total timbrado endurecida a ERROR.
    // Si |varianza| > 0.01 la factura NO queda como 'stamped': se persiste
    // igual la identidad fiscal (uuid, xml, urls, facturapi_invoice_id) —el
    // CFDI ya existe ante el SAT y debe poder cancelarse— pero con
    // cfdi_status='error' y se responde 502 para que el operador corrija.

    const stampedTotal = (facturApiInvoice as { total?: unknown }).total;
    const varianceCheck = computeStampVariance(inv.total, stampedTotal);
    const hasVariance = Boolean(varianceCheck && !varianceCheck.withinTolerance);
    const varianceMessage = hasVariance && varianceCheck
      ? `Error BL-A5: el total timbrado (${
        Number(stampedTotal).toFixed(2)
      }) difiere del total de la factura (${
        Number(inv.total).toFixed(2)
      }); varianza ${
        varianceCheck.variance.toFixed(2)
      }. El CFDI existe ante el SAT: cancélalo y corrige tasas/descuentos.`
      : null;
    if (hasVariance && varianceCheck) {
      console.error("[stamp-cfdi] BL-A5 stamp variance detectada", {
        invoice_id,
        invoice_total: inv.total,
        stamped_total: stampedTotal,
        variance: varianceCheck.variance,
      });
    }

    const updRes = await supabase.from("invoices").update({
      cfdi_uuid: cfdiUuid,
      cfdi_xml: cfdiXml,
      cfdi_xml_url: xmlStoragePath,
      cfdi_pdf_url: pdfStoragePath,
      cfdi_status: hasVariance ? "error" : "stamped",
      cfdi_error_message: varianceMessage,
      ...(varianceCheck
        ? {
          stamp_variance: varianceCheck.variance,
          stamp_variance_checked_at: new Date().toISOString(),
        }
        : {}),
      facturapi_invoice_id: facturApiId,
      facturapi_env: mode === "live" ? "live" : "test",

      ...(facturApiSeries ? { serie: facturApiSeries } : {}),
      ...(facturApiFolio ? { folio: facturApiFolio } : {}),
      ...(inv.status === "draft" ? { status: "sent" } : {}),
    }).eq("id", invoice_id);

    const updateErr = (updRes as { error: unknown }).error;
    if (updateErr) {
      console.error("[stamp-cfdi] DB update failed after stamp", {
        invoice_id,
        cfdiUuid,
      });
      return json(
        { error: "Stamped but failed to save to DB" },
        500,
        jsonHeaders,
      );
    }

    // Folio diferido: si el invoice_number todavía es placeholder BORRADOR-XXXX
    // y Facturapi devolvió folio, promovemos el invoice_number a FAC-<folio>.
    // Facturapi es la fuente de verdad para mantener 1:1 con su serie.
    let finalInvoiceNumber: string | null = null;
    const currentInvNum = (inv.invoice_number as string | null) ?? null;
    if (
      facturApiFolio &&
      currentInvNum &&
      currentInvNum.startsWith("BORRADOR-")
    ) {
      const rpcRes = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("assign_stamped_invoice_number", {
        p_invoice_id: invoice_id,
        p_serie: facturApiSeries,
        p_folio: facturApiFolio,
      });
      const rpcErr = rpcRes.error as { message?: string } | null;
      if (rpcErr) {
        console.error("[stamp-cfdi] assign_stamped_invoice_number failed", {
          invoice_id,
          err: rpcErr.message,
        });
        // No abortamos: la factura ya está timbrada. Se puede reparar manualmente.
      } else {
        finalInvoiceNumber = rpcRes.data as string;
      }
    }

    return json(
      {
        success: true,
        cfdi_uuid: cfdiUuid,
        facturapi_invoice_id: facturApiId,
        invoice_number: finalInvoiceNumber ?? currentInvNum,
        stub: false,
      },
      200,
      jsonHeaders,
    );
  } catch (err) {
    console.error("[stamp-cfdi] unhandled exception", err);
    // BL-03 (cierre): liberar el claim ante excepción no manejada para que la
    // factura no quede atascada en 'stamping'.
    // EC-A2: pero solo si NO alcanzamos a persistir el CFDI — en ese caso
    // dejamos 'stamping' para que el cron reconcile-stamping-invoices la
    // recupere sin re-timbrar.
    if (claimed && !cfdiPersisted && supabaseRef && invoiceIdRef) {
      try {
        await supabaseRef.from("invoices")
          .update({
            cfdi_status: "error",
            cfdi_error_message: "Internal error during stamping",
          })
          .eq("id", invoiceIdRef);
      } catch (releaseErr) {
        console.error("[stamp-cfdi] release-on-exception failed", {
          invoice_id: invoiceIdRef,
          err: releaseErr instanceof Error
            ? releaseErr.message
            : String(releaseErr),
        });
      }
    }
    return json({ error: "Internal server error" }, 500);
  }
}
