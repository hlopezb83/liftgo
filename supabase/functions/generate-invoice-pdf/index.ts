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
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lineItems = (invoice.line_items as any[]) || [];
    const rows = lineItems.map((item: any) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${item.description}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">€${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">€${Number(item.total).toFixed(2)}</td>
      </tr>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>${invoice.invoice_number}</title></head>
      <body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333">
        <div style="display:flex;justify-content:space-between;margin-bottom:40px">
          <div>
            <h1 style="margin:0;color:#e8590c;font-size:24px">ForkliftERP</h1>
            <p style="margin:4px 0;color:#666">Fleet Management</p>
          </div>
          <div style="text-align:right">
            <h2 style="margin:0;font-size:28px">INVOICE</h2>
            <p style="margin:4px 0;font-size:16px;font-weight:bold">${invoice.invoice_number}</p>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:30px">
          <div>
            <p style="margin:0;font-weight:bold">Bill To:</p>
            <p style="margin:4px 0">${invoice.customer_name || "—"}</p>
          </div>
          <div style="text-align:right">
            <p style="margin:2px 0"><strong>Issued:</strong> ${invoice.issued_at}</p>
            <p style="margin:2px 0"><strong>Due:</strong> ${invoice.due_date || "—"}</p>
            <p style="margin:2px 0"><strong>Status:</strong> ${invoice.status.toUpperCase()}</p>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:30px">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6">Description</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #dee2e6">Qty</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #dee2e6">Unit Price</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #dee2e6">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end">
          <div style="width:250px">
            <div style="display:flex;justify-content:space-between;padding:4px 0">
              <span>Subtotal:</span><span>€${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0">
              <span>Tax (${invoice.tax_rate}%):</span><span>€${Number(invoice.tax_amount).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #333;font-weight:bold;font-size:18px">
              <span>Total:</span><span>€${Number(invoice.total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        ${invoice.notes ? `<div style="margin-top:30px;padding:15px;background:#f8f9fa;border-radius:4px"><p style="margin:0;font-weight:bold">Notes:</p><p style="margin:4px 0">${invoice.notes}</p></div>` : ""}
      </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.html"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
