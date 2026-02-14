import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escPdf(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(invoice: any): Uint8Array {
  const lineItems = (invoice.line_items as any[]) || [];
  const objects: string[] = [];
  let objCount = 0;
  const offsets: number[] = [];

  function addObj(content: string): number {
    objCount++;
    objects.push(content);
    return objCount;
  }

  // Obj 1: Catalog
  addObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  // Obj 2: Pages (placeholder, update later)
  addObj(""); // placeholder
  // Obj 3: Font Helvetica
  addObj(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
  );
  // Obj 4: Font Helvetica-Bold
  addObj(
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj"
  );

  // Build page content stream
  const pw = 595.28; // A4 width in points
  const ph = 841.89; // A4 height in points
  const m = 50; // margin
  let cy = ph - m; // current y (top of page)

  let stream = "";

  // Helper functions for drawing
  const setFont = (bold: boolean, size: number) => {
    stream += `${bold ? "/F2" : "/F1"} ${size} Tf\n`;
  };
  const setColor = (r: number, g: number, b: number) => {
    stream += `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg\n`;
  };
  const drawText = (text: string, x: number, y: number) => {
    stream += `BT ${x.toFixed(2)} ${y.toFixed(2)} Td (${escPdf(text)}) Tj ET\n`;
  };
  const drawTextRight = (text: string, x: number, y: number) => {
    // Approximate char width for Helvetica
    const fontSize = parseFloat(
      (stream.match(/\/F[12] (\d+(?:\.\d+)?) Tf\n(?![\s\S]*\/F[12])/)?.[1]) || "10"
    );
    const charWidth = fontSize * 0.5;
    const textWidth = text.length * charWidth;
    drawText(text, x - textWidth, y);
  };
  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width = 0.5
  ) => {
    stream += `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  };
  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number
  ) => {
    stream += `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg\n`;
    stream += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  };

  stream += "BT\nET\n"; // init

  // Title - ForkliftERP
  setColor(232, 89, 12);
  setFont(true, 20);
  drawText("ForkliftERP", m, cy);

  setColor(102, 102, 102);
  setFont(false, 9);
  drawText("Fleet Management", m, cy - 14);

  // INVOICE title right
  setColor(51, 51, 51);
  setFont(true, 22);
  drawTextRight("INVOICE", pw - m, cy);
  setFont(true, 12);
  drawTextRight(invoice.invoice_number, pw - m, cy - 14);

  cy -= 45;

  // Bill To
  setColor(51, 51, 51);
  setFont(true, 10);
  drawText("Bill To:", m, cy);
  setFont(false, 10);
  drawText(invoice.customer_name || "—", m, cy - 14);

  // Details right
  setFont(false, 9);
  drawTextRight(`Issued: ${invoice.issued_at}`, pw - m, cy);
  drawTextRight(`Due: ${invoice.due_date || "N/A"}`, pw - m, cy - 12);
  drawTextRight(`Status: ${invoice.status.toUpperCase()}`, pw - m, cy - 24);

  cy -= 50;

  // Table header background
  drawRect(m, cy - 5, pw - m * 2, 16, 248, 249, 250);

  setColor(51, 51, 51);
  setFont(true, 9);
  drawText("Description", m + 5, cy);
  drawTextRight("Qty", m + 280, cy);
  drawTextRight("Unit Price", m + 370, cy);
  drawTextRight("Total", pw - m - 5, cy);

  cy -= 8;
  setColor(222, 226, 230);
  drawLine(m, cy, pw - m, cy, 0.5);
  cy -= 14;

  // Table rows
  setFont(false, 9);
  setColor(51, 51, 51);
  for (const item of lineItems) {
    drawText(String(item.description || ""), m + 5, cy);
    drawTextRight(String(item.quantity), m + 280, cy);
    drawTextRight(`€${Number(item.unit_price).toFixed(2)}`, m + 370, cy);
    drawTextRight(`€${Number(item.total).toFixed(2)}`, pw - m - 5, cy);
    cy -= 6;
    setColor(238, 238, 238);
    drawLine(m, cy, pw - m, cy, 0.2);
    setColor(51, 51, 51);
    cy -= 14;
  }

  // Totals
  cy -= 10;
  setFont(false, 10);
  drawTextRight("Subtotal:", pw - m - 80, cy);
  drawTextRight(`€${Number(invoice.subtotal).toFixed(2)}`, pw - m - 5, cy);

  cy -= 16;
  drawTextRight(`Tax (${invoice.tax_rate}%):`, pw - m - 80, cy);
  drawTextRight(
    `€${Number(invoice.tax_amount).toFixed(2)}`,
    pw - m - 5,
    cy
  );

  cy -= 8;
  setColor(51, 51, 51);
  drawLine(pw - m - 160, cy, pw - m, cy, 0.5);

  cy -= 14;
  setFont(true, 14);
  drawTextRight("Total:", pw - m - 80, cy);
  drawTextRight(`€${Number(invoice.total).toFixed(2)}`, pw - m - 5, cy);

  // Notes
  if (invoice.notes) {
    cy -= 30;
    drawRect(m, cy - 10, pw - m * 2, 30, 248, 249, 250);
    setFont(true, 10);
    setColor(51, 51, 51);
    drawText("Notes:", m + 5, cy + 5);
    setFont(false, 9);
    drawText(String(invoice.notes).substring(0, 100), m + 5, cy - 6);
  }

  // Build content stream object
  const streamBytes = new TextEncoder().encode(stream);
  const contentObj = addObj(
    `5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream\nendobj`
  );

  // Page object
  const pageObj = addObj(
    `6 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 5 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj`
  );

  // Update Pages object
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [6 0 R] /Count 1 >>\nendobj`;

  // Build PDF
  let pdf = "%PDF-1.4\n";
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += objects[i] + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += "xref\n";
  pdf += `0 ${objCount + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 0; i < objCount; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += "trailer\n";
  pdf += `<< /Size ${objCount + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF\n";

  return new TextEncoder().encode(pdf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = buildPdf(invoice);

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
