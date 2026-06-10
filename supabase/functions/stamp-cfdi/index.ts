import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // --- AuthN: require valid JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    // --- AuthZ: must be admin or administrativo ---
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) {
      return new Response(JSON.stringify({ error: "Authorization check failed" }), {
        status: 500, headers: jsonHeaders,
      });
    }
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "administrativo");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { invoice_id } = body;

    if (!isUUID(invoice_id)) {
      return new Response(JSON.stringify({ error: "invoice_id must be a valid UUID" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: jsonHeaders,
      });
    }

    // Guard: never stamp E2E test invoices against Facturapi / SAT
    if ((invoice as Record<string, unknown>).is_e2e === true) {
      return new Response(
        JSON.stringify({ error: "E2E invoices cannot be stamped" }),
        { status: 403, headers: jsonHeaders }
      );
    }

    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key")
      .limit(1)
      .maybeSingle();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company settings not configured" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Select API key: DB first, env var fallback
    const mode = (company as Record<string, unknown>).facturapi_mode as string || "test";
    const dbTestKey = (secrets?.facturapi_test_key as string | null | undefined) ?? null;
    const dbLiveKey = (secrets?.facturapi_live_key as string | null | undefined) ?? null;
    const apiKey = mode === "live"
      ? (dbLiveKey || Deno.env.get("FACTURAPI_LIVE_KEY"))
      : (dbTestKey || Deno.env.get("FACTURAPI_TEST_KEY"));

    if (!apiKey) {
      // Fallback: stub mode (original mock behaviour)
      const mockUuid = crypto.randomUUID();
      const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="${invoice.serie || ""}" Folio="${invoice.folio || ""}"
  Fecha="${new Date().toISOString()}"
  SubTotal="${invoice.subtotal}" Total="${invoice.total}">
  <tfd:TimbreFiscalDigital UUID="${mockUuid}" />
</cfdi:Comprobante>`;

      await supabase
        .from("invoices")
        .update({ cfdi_uuid: mockUuid, cfdi_xml: mockXml, cfdi_status: "stamped" })
        .eq("id", invoice_id);

      return new Response(
        JSON.stringify({ success: true, cfdi_uuid: mockUuid, stub: true }),
        { headers: jsonHeaders }
      );
    }

    // --- Real Facturapi timbrado ---
    const facturApiHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const items = Array.isArray(invoice.line_items)
      ? (invoice.line_items as Array<{ description?: string; quantity?: number; unit_price?: number; product_key?: string; }>).map((li) => ({
          product: {
            description: li.description || "Servicio de renta",
            product_key: li.product_key || "78101803",
            price: li.unit_price || 0,
            tax_included: false,
            taxes: [{ type: "IVA", rate: invoice.tax_rate > 0 ? invoice.tax_rate / 100 : 0.16 }],
          },
          quantity: li.quantity || 1,
        }))
      : [];

    const payload: Record<string, unknown> = {
      type: "I",
      customer: {
        legal_name: invoice.receptor_razon_social || invoice.customer_name || "Público General",
        tax_id: invoice.receptor_rfc || "XAXX010101000",
        tax_system: invoice.receptor_regimen_fiscal || "616",
        address: { zip: invoice.receptor_domicilio_fiscal_cp || "06600" },
      },
      items,
      payment_form: invoice.forma_pago || "99",
      payment_method: invoice.metodo_pago || "PUE",
      use: invoice.uso_cfdi || "G03",
      currency: invoice.moneda || "MXN",
      exchange: invoice.tipo_cambio || 1,
      series: invoice.serie || undefined,
      folio_number: invoice.folio ? Number(invoice.folio) : undefined,
    };

    const createRes = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: "POST",
      headers: facturApiHeaders,
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      console.error("Facturapi create error:", errBody);
      await supabase
        .from("invoices")
        .update({ cfdi_status: "error", cfdi_error_message: errBody.slice(0, 1000) })
        .eq("id", invoice_id);
      return new Response(
        JSON.stringify({ error: `Facturapi error: ${createRes.status}`, detail: errBody }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const facturApiInvoice = await createRes.json();
    const facturApiId = facturApiInvoice.id;
    const cfdiUuid = facturApiInvoice.uuid;

    let cfdiXml: string | null = null;
    let xmlStoragePath: string | null = null;
    let pdfStoragePath: string | null = null;

    try {
      const xmlRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}/xml`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (xmlRes.ok) {
        cfdiXml = await xmlRes.text();
        const path = `${invoice_id}/${cfdiUuid}.xml`;
        const { error: upErr } = await supabase.storage
          .from("cfdi-files")
          .upload(path, new Blob([cfdiXml], { type: "application/xml" }), {
            contentType: "application/xml",
            upsert: true,
          });
        if (!upErr) xmlStoragePath = path;
        else console.error("XML storage upload failed:", upErr);
      }
    } catch (xmlErr) {
      console.error("XML download failed:", xmlErr);
    }

    try {
      const pdfRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}/pdf`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (pdfRes.ok) {
        const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        const path = `${invoice_id}/${cfdiUuid}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("cfdi-files")
          .upload(path, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (!upErr) pdfStoragePath = path;
        else console.error("PDF storage upload failed:", upErr);
      }
    } catch (pdfErr) {
      console.error("PDF download failed:", pdfErr);
    }

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        cfdi_uuid: cfdiUuid,
        cfdi_xml: cfdiXml,
        cfdi_xml_url: xmlStoragePath,
        cfdi_pdf_url: pdfStoragePath,
        cfdi_status: "stamped",
        cfdi_error_message: null,
        facturapi_invoice_id: facturApiId,
      })
      .eq("id", invoice_id);

    if (updateErr) {
      console.error("DB update error after stamp:", updateErr);
      return new Response(JSON.stringify({ error: "Stamped but failed to save to DB" }), {
        status: 500, headers: jsonHeaders,
      });
    }

    return new Response(
      JSON.stringify({ success: true, cfdi_uuid: cfdiUuid, facturapi_invoice_id: facturApiId, stub: false }),
      { headers: jsonHeaders }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
