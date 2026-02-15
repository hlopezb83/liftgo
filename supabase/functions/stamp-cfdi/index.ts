import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch company settings
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company settings not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STUB MODE: Generate a mock CFDI UUID
    // When ready for production, replace this with actual PAC API call
    const mockUuid = crypto.randomUUID();
    const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="${invoice.serie || ""}" Folio="${invoice.folio || ""}"
  Fecha="${new Date().toISOString()}"
  FormaPago="${invoice.forma_pago || "99"}"
  MetodoPago="${invoice.metodo_pago || "PUE"}"
  Moneda="${invoice.moneda || "MXN"}"
  TipoCambio="${invoice.tipo_cambio || 1}"
  SubTotal="${invoice.subtotal}" Total="${invoice.total}">
  <cfdi:Emisor Rfc="${company.rfc}" Nombre="${company.razon_social}" RegimenFiscal="${company.regimen_fiscal}" />
  <cfdi:Receptor Rfc="${invoice.receptor_rfc || ""}" Nombre="${invoice.receptor_razon_social || ""}"
    RegimenFiscalReceptor="${invoice.receptor_regimen_fiscal || ""}"
    DomicilioFiscalReceptor="${invoice.receptor_domicilio_fiscal_cp || ""}"
    UsoCFDI="${invoice.uso_cfdi || "G03"}" />
  <!-- STUB: This is a mock XML. Replace with real PAC-stamped XML -->
  <tfd:TimbreFiscalDigital UUID="${mockUuid}" />
</cfdi:Comprobante>`;

    // Update the invoice with CFDI data
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        cfdi_uuid: mockUuid,
        cfdi_xml: mockXml,
        cfdi_status: "stamped",
      })
      .eq("id", invoice_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, cfdi_uuid: mockUuid, stub: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
