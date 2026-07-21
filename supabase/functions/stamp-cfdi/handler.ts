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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const token = authHeader.replace("Bearer ", "");

    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const claims = claimsData.claims as Record<string, unknown>;
    // EC-A1: bypass de user-role para el consumidor interno de la cola de
    // reintentos. Solo service_role JWT (backend) puede saltar la verificación
    // de rol de usuario; cualquier otro token cae al flujo normal.
    const isServiceRole = claims.role === "service_role";
    const userId = (claims.sub as string | undefined) ?? "";

    const supabase = deps.createServiceClient();
    supabaseRef = supabase;

    if (!isServiceRole) {
      if (!userId) {
        return json({ error: "Unauthorized" }, 401, jsonHeaders);
      }
      const rolesRes = await supabase.from("user_roles").select("role").eq(
        "user_id",
        userId,
      );
      const roles = (rolesRes as { data: unknown; error: unknown }).data as
        | Array<{ role: string }>
        | null;
      const rolesErr = (rolesRes as { data: unknown; error: unknown }).error;
      if (rolesErr) {
        console.error("[stamp-cfdi] roles lookup failed", { userId });
        return json({ error: "Authorization check failed" }, 500, jsonHeaders);
      }
      const allowed = (roles ?? []).some((r) =>
        r.role === "admin" || r.role === "administrativo"
      );
      if (!allowed) {
        console.error("[stamp-cfdi] forbidden", { userId });
        return json({ error: "Forbidden" }, 403, jsonHeaders);
      }
    }

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
    const taxRateFraction = taxRatePct / 100;
    const items = Array.isArray(inv.line_items)
      ? (inv.line_items as Array<
        {
          description?: string;
          quantity?: number;
          unit_price?: number;
          product_key?: string;
          discount?: number;
          discount_type?: "%" | "$";
        }
      >).map((li) => {
        const quantity = li.quantity || 1;
        const unitPrice = li.unit_price || 0;
        const item: Record<string, unknown> = {
          product: {
            description: li.description || "Servicio de renta",
            product_key: li.product_key || "78101803",
            price: unitPrice,
            tax_included: false,
            taxes: [{ type: "IVA", rate: taxRateFraction }],
          },
          quantity,
        };
        // BL-02: propagar descuento al CFDI. Facturapi acepta `discount` como
        // monto absoluto por línea (antes de impuestos). Convertimos porcentaje
        // a monto para que el XML timbrado coincida con el total de la app.
        if (li.discount && li.discount > 0) {
          const base = unitPrice * quantity;
          const discountAmount = li.discount_type === "$"
            ? Math.min(li.discount, base)
            : (base * li.discount) / 100;
          if (discountAmount > 0) {
            // BL-A5: `roundMoney` (2 decimales, centavos enteros) reemplaza el
            // `Math.round(*100)/100` histórico para eliminar drift IEEE-754.
            item.discount = roundMoney(discountAmount);
          }
        }
        return item;
      })
      : [];

    const receptorRfc = (inv.receptor_rfc || "XAXX010101000").toUpperCase();
    const isGlobal = receptorRfc === "XAXX010101000";

    // Overrides fiscales obligatorios para Público en General (CFDI 4.0)
    const paymentMethod = isGlobal ? "PUE" : (inv.metodo_pago || "PUE");
    // SAT CFDI 4.0: cuando metodo_pago = PPD, forma_pago DEBE ser "99" (Por definir)
    const paymentForm = isGlobal
      ? "01"
      : (paymentMethod === "PPD" ? "99" : (inv.forma_pago || "99"));
    const usoCfdi = isGlobal ? "S01" : (inv.uso_cfdi || "G03");
    const legalName = isGlobal ? "PUBLICO EN GENERAL" : sanitizeLegalName(
      inv.receptor_razon_social || inv.customer_name || "Público General",
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
      currency: inv.moneda || "MXN",
      exchange: inv.tipo_cambio || 1,
      series: inv.serie || undefined,
      // BL-20: validar folio numérico antes de castear (Number("BORRADOR")=NaN
      // rompía el payload JSON hacia Facturapi).
      folio_number: (() => {
        if (!inv.folio) return undefined;
        const n = Number(inv.folio);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
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

    // BL-A5: reconciliación del total timbrado. Facturapi redondea
    // descuentos/impuestos por línea de forma distinta a la app; si el total
    // timbrado difiere de invoices.total se REGISTRA la varianza (columnas
    // stamp_variance*) sin romper el flujo 'stamped' — solo warning en
    // cfdi_error_message + console.error para auditoría fiscal.

    const stampedTotal = (facturApiInvoice as { total?: unknown }).total;
    const varianceCheck = computeStampVariance(inv.total, stampedTotal);
    if (varianceCheck && !varianceCheck.withinTolerance) {
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
      cfdi_status: "stamped",
      cfdi_error_message: varianceCheck && !varianceCheck.withinTolerance
        ? `Advertencia BL-A5: el total timbrado (${
          Number(stampedTotal).toFixed(2)
        }) difiere del total de la factura (${
          Number(inv.total).toFixed(2)
        }); varianza ${varianceCheck.variance.toFixed(2)}.`
        : null,
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
