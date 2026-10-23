import { hasLegacyVat, LEGACY_VAT_MESSAGE } from "../_shared/legacyVat.ts";
// Pure handler for stamp-cfdi, deps-injected for testability.
// The Deno.serve entry wires Supabase, the invoice PAC gateway and env.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  describeFacturapiError,
  isFacturapiConfigError,
} from "../_shared/facturapi/client.ts";
import { classifyPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import {
  FiscalRetryContextError,
  getRetryAwareFacturapiConfig,
} from "../_shared/facturapi/retryContext.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";
import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
} from "../_shared/cfdiRetryQueue.ts";
import { computeStampVariance } from "../_shared/money.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import { buildInvoicePayload } from "./invoicePayload.ts";
import type { InvoiceGateway } from "./invoiceGateway.ts";

// Re-exports usados por las pruebas y por cancel-payment-complement.
export { computeStampVariance };
export type { SupabaseLike };

export interface StampCfdiDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  createInvoiceGateway: (apiKey: string) => InvoiceGateway;
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

    // Multiempresa · Fase 1: la organización se deriva del servidor (membresía
    // del caller + organization_id del documento leído), NUNCA del body.
    // Se valida ANTES de cualquier claim, update o llamada al PAC.
    const orgCheck = await resolveDocumentOrganization({
      admin: supabase,
      userId: auth.userId,
      isServiceRole: auth.isServiceRole,
      documentOrganizationId: inv.organization_id as string | null | undefined,
    });
    if (!orgCheck.ok) {
      console.error("[stamp-cfdi] organization check failed", {
        invoice_id,
        status: orgCheck.status,
      });
      return json({ error: orgCheck.message }, orgCheck.status, jsonHeaders);
    }
    const organizationId = orgCheck.organizationId;

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
    if (inv.facturapi_invoice_id) {
      return json(
        {
          error:
            "El CFDI ya tiene un ID de Facturapi. Espera la conciliación o revisa su estado antes de reemitir.",
          facturapi_invoice_id: inv.facturapi_invoice_id,
        },
        409,
        jsonHeaders,
      );
    }

    // Validate before a claim or provider call, preserving already issued history.
    if (hasLegacyVat(inv)) {
      return json(
        { error: LEGACY_VAT_MESSAGE, code: "OBSOLETE_VAT_RATE" },
        422,
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

    // 8.8.7: un error de lectura de company_settings se distingue de "no
    // configurada": se libera el claim y se responde 503, sin timbrar ni caer
    // a modo test.
    const { data: company, error: companyErr } = await supabase
      .from("company_settings").select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (companyErr) {
      console.error("[stamp-cfdi] company_settings read error", {
        invoice_id,
        organizationId,
      });
      await releaseClaim(
        "No se pudo leer la configuración fiscal de la empresa. No se emitió CFDI.",
      );
      return json(
        {
          error:
            "No se pudo leer la configuración fiscal de la empresa. Reintenta en unos segundos.",
        },
        503,
        jsonHeaders,
      );
    }
    if (!company) {
      console.error("[stamp-cfdi] company_settings missing", {
        invoice_id,
        organizationId,
      });
      await releaseClaim("Company settings not configured");
      return json(
        { error: "Company settings not configured" },
        400,
        jsonHeaders,
      );
    }
    const co = company as Record<string, unknown>;
    let apiKey: string | null;
    let mode: string;
    try {
      const cfg = await getRetryAwareFacturapiConfig({
        admin: supabase,
        env: deps.env,
        organizationId,
        modeOverride: (co.facturapi_mode as string | undefined) ?? null,
        body,
        isServiceRole: auth.isServiceRole,
        documentId: invoice_id,
        operation: "stamp",
      });
      apiKey = cfg.apiKey;
      mode = cfg.mode;
    } catch (err) {
      if (err instanceof FiscalRetryContextError) {
        await releaseClaim(err.message);
        return json({ error: err.message, code: err.code }, err.status);
      }
      if (isFacturapiConfigError(err)) {
        console.error("[stamp-cfdi] configuración fiscal no resoluble", {
          invoice_id,
          organization_id: organizationId,
          code: err.code,
        });
        await releaseClaim(
          "Configuración fiscal de la empresa no resoluble. No se emitió CFDI.",
        );
        return json(
          { error: err.message },
          err.code === "config_read_error" ? 503 : 400,
          jsonHeaders,
        );
      }
      throw err;
    }

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

    const gateway = deps.createInvoiceGateway(apiKey);

    const built = buildInvoicePayload({ invoiceId: invoice_id, invoice: inv });
    if (!built.ok) {
      await releaseClaim(built.claimError);
      return json({ error: built.error }, built.status, jsonHeaders);
    }
    const payload = built.payload;

    let facturApiInvoice: { id: string; uuid?: string; status?: string };
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
        gateway.create(payload, { signal: stampAbort.signal }),
        timeoutPromise,
      ]) as { id: string; uuid?: string; status?: string };
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
          fiscalConfig: { apiKey, mode },
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

    // A 202 response has an ID but no UUID. The PAC owns this document now;
    // never release the claim or try to create it again while it is pending.
    cfdiPersisted = true;
    const pacResult = classifyPacInvoice(facturApiInvoice);
    if (pacResult.kind !== "hit") {
      const facturapiId = "facturapi_id" in pacResult
        ? pacResult.facturapi_id
        : (typeof facturApiInvoice.id === "string"
          ? facturApiInvoice.id
          : null);
      await supabase.from("invoices").update({
        ...(facturapiId ? { facturapi_invoice_id: facturapiId } : {}),
        cfdi_status: pacResult.kind === "failed" ? "error" : "stamping",
        cfdi_error_message: pacResult.kind === "pending"
          ? "Facturapi aceptó el CFDI; timbrado pendiente de resolución."
          : "Respuesta de Facturapi sin UUID válido. Revisar antes de reemitir.",
      }).eq("id", invoice_id);
      return json(
        {
          error: pacResult.kind === "pending"
            ? "Facturapi aceptó el CFDI; timbrado pendiente de resolución."
            : "Facturapi no devolvió un UUID válido; requiere conciliación.",
          code: pacResult.kind === "pending" ? "PAC_PENDING" : "PAC_INCOMPLETE",
          ...(facturapiId ? { facturapi_invoice_id: facturapiId } : {}),
        },
        pacResult.kind === "pending" ? 202 : 502,
        jsonHeaders,
      );
    }
    const facturApiId = pacResult.facturapi_id;
    const cfdiUuid = pacResult.uuid;
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
      cfdiXml = await gateway.downloadXml(facturApiId);
      const path = organizationStoragePath(
        inv.organization_id,
        `${invoice_id}/${cfdiUuid}.xml`,
      );
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
      const pdfBytes = await gateway.downloadPdf(facturApiId);
      const path = organizationStoragePath(
        inv.organization_id,
        `${invoice_id}/${cfdiUuid}.pdf`,
      );
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
    const hasVariance = Boolean(
      varianceCheck && !varianceCheck.withinTolerance,
    );
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

    // C-1: varianza fuera de tolerancia → se cortó el flujo después de
    // persistir la identidad fiscal, para no dejar un CFDI huérfano.
    if (hasVariance) {
      return json(
        {
          error: varianceMessage ??
            "Stamp variance exceeds tolerance; invoice not stamped",
          cfdi_uuid: cfdiUuid,
        },
        502,
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
