import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const BUCKET = "cfdi-files";

type LineItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  product_key?: string;
};

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const token = authHeader.replace("Bearer ", "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "administrativo");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => null);
    const credit_note_id = body?.credit_note_id;
    if (!isUUID(credit_note_id)) {
      return new Response(JSON.stringify({ error: "credit_note_id must be UUID" }), { status: 400, headers: jsonHeaders });
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("id", credit_note_id)
      .single();
    if (ncErr || !nc) {
      return new Response(JSON.stringify({ error: "Credit note not found" }), { status: 404, headers: jsonHeaders });
    }
    if (nc.cfdi_status === "stamped") {
      return new Response(JSON.stringify({ error: "Credit note already stamped" }), { status: 409, headers: jsonHeaders });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", nc.invoice_id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }
    if (invoice.cfdi_status !== "stamped" || !invoice.facturapi_invoice_id) {
      return new Response(JSON.stringify({ error: "Source invoice must be stamped" }), { status: 400, headers: jsonHeaders });
    }

    const { data: company } = await supabase.from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase.from("billing_secrets").select("facturapi_test_key, facturapi_live_key").limit(1).maybeSingle();
    const mode = (company?.facturapi_mode as string | undefined) || "test";
    const apiKey = mode === "live"
      ? ((secrets?.facturapi_live_key as string | null) || Deno.env.get("FACTURAPI_LIVE_KEY"))
      : ((secrets?.facturapi_test_key as string | null) || Deno.env.get("FACTURAPI_TEST_KEY"));

    if (!apiKey) {
      // stub mode
      const mockUuid = crypto.randomUUID();
      await supabase
        .from("credit_notes")
        .update({ cfdi_uuid: mockUuid, cfdi_status: "stamped", status: "stamped" })
        .eq("id", credit_note_id);
      return new Response(JSON.stringify({ success: true, cfdi_uuid: mockUuid, stub: true }), { headers: jsonHeaders });
    }

    const items = Array.isArray(nc.line_items)
      ? (nc.line_items as LineItem[]).map((li) => ({
          product: {
            description: li.description || "Nota de crédito",
            product_key: li.product_key || "84111506",
            price: li.unit_price || 0,
            tax_included: false,
            taxes: [{ type: "IVA", rate: Number(nc.tax_rate) > 0 ? Number(nc.tax_rate) / 100 : 0 }],
          },
          quantity: li.quantity || 1,
        }))
      : [];

    const payload: Record<string, unknown> = {
      type: "E",
      use: "G02", // Devoluciones, descuentos o bonificaciones
      customer: {
        legal_name: invoice.receptor_razon_social || invoice.customer_name || "Público General",
        tax_id: invoice.receptor_rfc || "XAXX010101000",
        tax_system: invoice.receptor_regimen_fiscal || "616",
        address: { zip: invoice.receptor_domicilio_fiscal_cp || "06600" },
      },
      items,
      payment_form: invoice.forma_pago || "99",
      payment_method: "PUE",
      currency: nc.currency || "MXN",
      exchange: 1,
      related_documents: [
        {
          relationship: "01", // Nota de crédito de los documentos relacionados
          documents: [{ document: invoice.facturapi_invoice_id }],
        },
      ],
    };

    const createRes = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      console.error("Facturapi credit note error:", errBody);
      await supabase
        .from("credit_notes")
        .update({ cfdi_status: "error", cfdi_error_message: errBody.slice(0, 1000) })
        .eq("id", credit_note_id);
      return new Response(JSON.stringify({ error: `Facturapi error: ${createRes.status}`, detail: errBody }), {
        status: 502, headers: jsonHeaders,
      });
    }

    const fa = await createRes.json();
    const facturApiId = fa.id;
    const cfdiUuid = fa.uuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xmlRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}/xml`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (xmlRes.ok) {
        const xml = await xmlRes.text();
        const path = `credit-notes/${credit_note_id}/${cfdiUuid}.xml`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, new Blob([xml], { type: "application/xml" }), {
          contentType: "application/xml", upsert: true,
        });
        if (!upErr) xmlPath = path;
      }
    } catch (e) { console.error("xml dl failed", e); }

    try {
      const pdfRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}/pdf`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (pdfRes.ok) {
        const bytes = new Uint8Array(await pdfRes.arrayBuffer());
        const path = `credit-notes/${credit_note_id}/${cfdiUuid}.pdf`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: "application/pdf", upsert: true,
        });
        if (!upErr) pdfPath = path;
      }
    } catch (e) { console.error("pdf dl failed", e); }

    await supabase
      .from("credit_notes")
      .update({
        facturapi_invoice_id: facturApiId,
        cfdi_uuid: cfdiUuid,
        cfdi_status: "stamped",
        status: "stamped",
        cfdi_xml_url: xmlPath,
        cfdi_pdf_url: pdfPath,
        cfdi_error_message: null,
      })
      .eq("id", credit_note_id);

    return new Response(JSON.stringify({ success: true, cfdi_uuid: cfdiUuid, facturapi_invoice_id: facturApiId }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error("stamp-credit-note error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
