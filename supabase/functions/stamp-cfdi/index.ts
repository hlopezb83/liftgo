import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { invoice_id } = body;

    if (!isUUID(invoice_id)) {
      return new Response(JSON.stringify({ error: "invoice_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        cfdi_uuid: mockUuid,
        cfdi_xml: mockXml,
        cfdi_status: "stamped",
      })
      .eq("id", invoice_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to stamp invoice" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, cfdi_uuid: mockUuid, stub: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
