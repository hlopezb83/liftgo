// Pure handler for stamp-cfdi, deps-injected for testability.
// The Deno.serve entry in index.ts wires real createClient + fetch + env.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import type { QueryBuilderLike, SupabaseLike } from "../_shared/types.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

// Mantenido por compatibilidad con consumidores existentes (tests, etc.).
export const FACTURAPI_BASE = "https://www.facturapi.io/v2";

/**
 * CFDI 4.0: legal_name del receptor debe ir EN MAYÚSCULAS, sin acentos,
 * sin régimen societario (S.A. de C.V., S. de R.L., SAPI, etc.) y sin
 * puntuación final. Coincide con la razón social registrada en el SAT.
 */
export function sanitizeLegalName(raw: string): string {
  const SUFFIX_RE =
    /\b(S\.?\s*A\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*DE\s*R\.?\s*L\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*C\.?|S\.?\s*A\.?\s*P\.?\s*I\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*A\.?\s*S\.?|A\.?\s*C\.?|S\.?\s*A\.?\s*B\.?\s*(DE\s*C\.?\s*V\.?)?)\b\.?/g;
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(SUFFIX_RE, "")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Re-export para compatibilidad con consumidores existentes.
export type { QueryBuilderLike, SupabaseLike };

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
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const token = authHeader.replace("Bearer ", "");

    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const userId = claimsData.claims.sub;

    const supabase = deps.createServiceClient();
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

    const { data: company } = await supabase
      .from("company_settings").select("*").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();

    if (!company) {
      console.error("[stamp-cfdi] company_settings missing", { invoice_id });
      return json(
        { error: "Company settings not configured" },
        400,
        jsonHeaders,
      );
    }

    const co = company as Record<string, unknown>;
    const sec = (secrets ?? {}) as Record<string, unknown>;
    const mode = (co.facturapi_mode as string) || "test";
    const dbTestKey = (sec.facturapi_test_key as string | null | undefined) ??
      null;
    const dbLiveKey = (sec.facturapi_live_key as string | null | undefined) ??
      null;
    const apiKey = resolveFacturapiKey({
      mode: mode === "live" ? "live" : "test",
      dbTestKey,
      dbLiveKey,
      envTestKey: deps.env("FACTURAPI_TEST_KEY"),
      envLiveKey: deps.env("FACTURAPI_LIVE_KEY"),
    });

    if (!apiKey) {
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
          facturapi_env: mode === "live" ? "live" : "test",
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

    const taxRate = typeof inv.tax_rate === "number" ? inv.tax_rate : 16;
    const items = Array.isArray(inv.line_items)
      ? (inv.line_items as Array<
        {
          description?: string;
          quantity?: number;
          unit_price?: number;
          product_key?: string;
        }
      >).map((li) => ({
        product: {
          description: li.description || "Servicio de renta",
          product_key: li.product_key || "78101803",
          price: li.unit_price || 0,
          tax_included: false,
          taxes: [{ type: "IVA", rate: taxRate > 0 ? taxRate / 100 : 0.16 }],
        },
        quantity: li.quantity || 1,
      }))
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
      folio_number: inv.folio ? Number(inv.folio) : undefined,
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
        throw new Error(
          `Periodicidad global inválida: "${raw}". Debe ser código SAT 01-05.`,
        );
      }
      payload.global = {
        periodicity,
        months: String(inv.global_months),
        year: Number(inv.global_year),
      };
    }

    let facturApiInvoice: { id: string; uuid: string };
    try {
      facturApiInvoice = await client.invoices.create(payload) as {
        id: string;
        uuid: string;
      };
    } catch (err) {
      const desc = describeFacturapiError(err);
      console.error("[stamp-cfdi] facturapi rejected", {
        invoice_id,
        status: desc.status,
        code: desc.code,
        message: desc.message,
      });
      await supabase.from("invoices")
        .update({
          cfdi_status: "error",
          cfdi_error_message: desc.detail.slice(0, 1000),
        })
        .eq("id", invoice_id);
      const errorText = desc.code
        ? `${desc.code}: ${desc.message}`
        : desc.message;
      return json(
        {
          error: errorText,
          code: desc.code,
          status: desc.status,
          detail: desc.detail,
        },
        502,
        jsonHeaders,
      );
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

    const updRes = await supabase.from("invoices").update({
      cfdi_uuid: cfdiUuid,
      cfdi_xml: cfdiXml,
      cfdi_xml_url: xmlStoragePath,
      cfdi_pdf_url: pdfStoragePath,
      cfdi_status: "stamped",
      cfdi_error_message: null,
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
    return json({ error: "Internal server error" }, 500, {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    });
  }
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
