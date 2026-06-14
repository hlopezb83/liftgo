// Pure handler for stamp-credit-note, deps-injected for testability.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import type { StampCfdiDeps } from "../stamp-cfdi/handler.ts";
import type { SupabaseLike } from "../_shared/types.ts";

export type { SupabaseLike };
export type StampCreditNoteDeps = StampCfdiDeps;

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const BUCKET = "cfdi-files";

type LineItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  product_key?: string;
};

export async function handleStampCreditNote(
  req: Request,
  deps: StampCreditNoteDeps,
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
    const roles = (rolesRes as { data: unknown }).data as
      | Array<{ role: string }>
      | null;
    const allowed = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) {
      return json({ error: "Forbidden" }, 403, jsonHeaders);
    }

    const body = await req.json().catch(() => null);
    const credit_note_id = body?.credit_note_id;
    if (!isUUID(credit_note_id)) {
      return json({ error: "credit_note_id must be UUID" }, 400, jsonHeaders);
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes").select("*").eq("id", credit_note_id).single();
    if (ncErr || !nc) {
      return json({ error: "Credit note not found" }, 404, jsonHeaders);
    }
    const ncRow = nc as Record<string, unknown>;
    if (ncRow.cfdi_status === "stamped") {
      return json({ error: "Credit note already stamped" }, 409, jsonHeaders);
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", ncRow.invoice_id).single();
    if (invErr || !invoice) {
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }
    const inv = invoice as Record<string, unknown>;
    if (inv.cfdi_status !== "stamped" || !inv.facturapi_invoice_id) {
      return json(
        { error: "Source invoice must be stamped" },
        400,
        jsonHeaders,
      );
    }

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets").select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();
    const co = (company ?? {}) as Record<string, unknown>;
    const sec = (secrets ?? {}) as Record<string, unknown>;
    const mode = (co.facturapi_mode as string | undefined) || "test";
    const apiKey = mode === "live"
      ? ((sec.facturapi_live_key as string | null) ||
        deps.env("FACTURAPI_LIVE_KEY"))
      : ((sec.facturapi_test_key as string | null) ||
        deps.env("FACTURAPI_TEST_KEY"));

    if (!apiKey) {
      const mockUuid = crypto.randomUUID();
      await supabase.from("credit_notes")
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

    const items = Array.isArray(ncRow.line_items)
      ? (ncRow.line_items as LineItem[]).map((li) => ({
        product: {
          description: li.description || "Nota de crédito",
          product_key: li.product_key || "84111506",
          price: li.unit_price || 0,
          tax_included: false,
          taxes: [{
            type: "IVA",
            rate: Number(ncRow.tax_rate) > 0 ? Number(ncRow.tax_rate) / 100 : 0,
          }],
        },
        quantity: li.quantity || 1,
      }))
      : [];

    const payload: Record<string, unknown> = {
      type: "E",
      use: "G02",
      customer: {
        legal_name: inv.receptor_razon_social || inv.customer_name ||
          "Público General",
        tax_id: inv.receptor_rfc || "XAXX010101000",
        tax_system: inv.receptor_regimen_fiscal || "616",
        address: { zip: inv.receptor_domicilio_fiscal_cp || "06600" },
      },
      items,
      payment_form: inv.forma_pago || "99",
      payment_method: "PUE",
      currency: ncRow.currency || "MXN",
      exchange: 1,
      related_documents: [
        {
          relationship: "01",
          documents: [{ document: inv.facturapi_invoice_id }],
        },
      ],
    };

    const createRes = await deps.fetchImpl(`${FACTURAPI_BASE}/invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      await supabase.from("credit_notes")
        .update({
          cfdi_status: "error",
          cfdi_error_message: errBody.slice(0, 1000),
        })
        .eq("id", credit_note_id);
      return json(
        { error: `Facturapi error: ${createRes.status}`, detail: errBody },
        502,
        jsonHeaders,
      );
    }

    const fa = await createRes.json();
    const facturApiId = fa.id;
    const cfdiUuid = fa.uuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xmlRes = await deps.fetchImpl(
        `${FACTURAPI_BASE}/invoices/${facturApiId}/xml`,
        {
          headers: { "Authorization": `Bearer ${apiKey}` },
        },
      );
      if (xmlRes.ok) {
        const xml = await xmlRes.text();
        const path = `credit-notes/${credit_note_id}/${cfdiUuid}.xml`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(
          path,
          new Blob([xml], { type: "application/xml" }),
          { contentType: "application/xml", upsert: true },
        );
        if (!upErr) xmlPath = path;
      }
    } catch (_e) { /* keep null */ }

    try {
      const pdfRes = await deps.fetchImpl(
        `${FACTURAPI_BASE}/invoices/${facturApiId}/pdf`,
        {
          headers: { "Authorization": `Bearer ${apiKey}` },
        },
      );
      if (pdfRes.ok) {
        const bytes = new Uint8Array(await pdfRes.arrayBuffer());
        const path = `credit-notes/${credit_note_id}/${cfdiUuid}.pdf`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(
          path,
          bytes,
          { contentType: "application/pdf", upsert: true },
        );
        if (!upErr) pdfPath = path;
      }
    } catch (_e) { /* keep null */ }

    await supabase.from("credit_notes").update({
      facturapi_invoice_id: facturApiId,
      cfdi_uuid: cfdiUuid,
      cfdi_status: "stamped",
      status: "stamped",
      cfdi_xml_url: xmlPath,
      cfdi_pdf_url: pdfPath,
      cfdi_error_message: null,
    }).eq("id", credit_note_id);

    return json(
      { success: true, cfdi_uuid: cfdiUuid, facturapi_invoice_id: facturApiId },
      200,
      jsonHeaders,
    );
  } catch (_err) {
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
