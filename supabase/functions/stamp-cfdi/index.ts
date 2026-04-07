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
    const body = await req.json();
    const { invoice_id } = body;

    if (!isUUID(invoice_id)) {
      return new Response(JSON.stringify({ error: "invoice_id must be a valid UUID" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company settings not configured" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Select API key: DB first, env var fallback
    const mode = (company as Record<string, unknown>).facturapi_mode as string || "test";
    const dbTestKey = (company as Record<string, unknown>).facturapi_test_key as string | null;
    const dbLiveKey = (company as Record<string, unknown>).facturapi_live_key as string | null;
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
      ? (invoice.line_items as Array<{ description?: string; quantity?: number; unit_price?: number; }>).map((li) => ({
          product: {
            description: li.description || "Servicio de renta",
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
      return new Response(
        JSON.stringify({ error: `Facturapi error: ${createRes.status}`, detail: errBody }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const facturApiInvoice = await createRes.json();
    const facturApiId = facturApiInvoice.id;
    const cfdiUuid = facturApiInvoice.uuid;

    let cfdiXml: string | null = null;
    try {
      const xmlRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}/xml`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (xmlRes.ok) {
        cfdiXml = await xmlRes.text();
      }
    } catch (_xmlErr) {
      // XML download is optional
    }

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        cfdi_uuid: cfdiUuid,
        cfdi_xml: cfdiXml,
        cfdi_status: "stamped",
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
