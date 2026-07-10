import { handleCors } from "../_shared/cors.ts";
import { requireRole } from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";

const BUCKET = "cfdi-files";
const TOLERANCE = 0.01;

// ---------- Helpers (XML parsing sin DOM) ----------

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "i",
  );
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractAllAttr(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "ig",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// Encuentra TODOS los nodos cfdi/pago Pago para extraer Monto/Fecha y sus DoctoRelacionado
function extractPagoNodes(
  xml: string,
): Array<{ monto: number; doctos: string[] }> {
  const reOpen = /<(?:[a-zA-Z0-9]+:)?Pago\b[^>]*>/g;
  const result: Array<{ monto: number; doctos: string[] }> = [];
  let m: RegExpExecArray | null;
  while ((m = reOpen.exec(xml)) !== null) {
    const start = m.index;
    const closeRe = /<\/(?:[a-zA-Z0-9]+:)?Pago>/g;
    closeRe.lastIndex = reOpen.lastIndex;
    const c = closeRe.exec(xml);
    if (!c) break;
    const block = xml.slice(start, c.index + c[0].length);
    const monto = Number(extractAttr(m[0], "Pago", "Monto") ?? "0");
    const doctos = extractAllAttr(block, "DoctoRelacionado", "IdDocumento");
    result.push({ monto, doctos });
  }
  return result;
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const { userId, adminClient: supabase } = auth;

    const body = await req.json().catch(() => ({}));
    const { payment_id, xml_base64, pdf_base64 } = body as {
      payment_id?: string;
      xml_base64?: string;
      pdf_base64?: string | null;
    };
    if (!isUUID(payment_id)) {
      return jsonError(req, 400, "payment_id inválido");
    }
    if (!xml_base64 || typeof xml_base64 !== "string") {
      return jsonError(req, 400, "xml_base64 es obligatorio");
    }

    // Load payment + bill + supplier
    const { data: payment, error: payErr } = await supabase
      .from("supplier_payments")
      .select("id, bill_id, amount, rep_status, rep_required")
      .eq("id", payment_id).single();
    if (payErr || !payment) {
      return jsonError(req, 404, "Pago no encontrado");
    }
    if (!payment.rep_required) {
      return jsonError(req, 400, "Este pago no requiere REP");
    }

    const { data: bill } = await supabase
      .from("supplier_bills")
      .select(
        "id, cfdi_uuid, supplier_id, payment_method_sat, suppliers(rfc, name)",
      )
      .eq("id", payment.bill_id).single();
    if (!bill) {
      return jsonError(req, 404, "Factura no encontrada");
    }
    if (!bill.cfdi_uuid) {
      return jsonError(req, 400, "La factura no tiene UUID CFDI");
    }

    // Decode XML
    let xmlText: string;
    try {
      const bin = atob(xml_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      xmlText = new TextDecoder("utf-8").decode(bytes);
    } catch {
      return jsonError(req, 400, "XML inválido (base64)");
    }

    // Validaciones
    const tipo = extractAttr(xmlText, "Comprobante", "TipoDeComprobante");
    if (tipo !== "P") {
      return jsonError(
        req,
        400,
        "El XML no es un Complemento de Pago (TipoDeComprobante distinto de P)",
      );
    }

    const rfcEmisor = extractAttr(xmlText, "Emisor", "Rfc");
    const supplierRfc = (bill.suppliers as { rfc?: string | null } | null)?.rfc
      ?.trim().toUpperCase();
    if (!supplierRfc) {
      return jsonError(req, 400, "El proveedor no tiene RFC capturado");
    }
    if (!rfcEmisor || rfcEmisor.trim().toUpperCase() !== supplierRfc) {
      return jsonError(
        req,
        400,
        `RFC emisor (${
          rfcEmisor ?? "n/a"
        }) no coincide con el proveedor (${supplierRfc})`,
      );
    }

    // UUID del REP
    const repUuid = extractAttr(xmlText, "TimbreFiscalDigital", "UUID");
    if (!repUuid || !isUUID(repUuid)) {
      return jsonError(
        req,
        400,
        "No se encontró UUID válido en TimbreFiscalDigital",
      );
    }

    // Pagos: validar que al menos uno referencie nuestra factura con monto correcto
    const pagos = extractPagoNodes(xmlText);
    if (pagos.length === 0) {
      return jsonError(req, 400, "El XML no contiene nodos Pago");
    }

    const targetUuid = bill.cfdi_uuid.toLowerCase();
    const expectedAmount = Number(payment.amount);
    const match = pagos.find((p) =>
      p.doctos.some((d) => d.toLowerCase() === targetUuid) &&
      Math.abs(p.monto - expectedAmount) <= TOLERANCE
    );

    if (!match) {
      const partial = pagos.some((p) =>
        p.doctos.some((d) => d.toLowerCase() === targetUuid)
      );
      const msg = partial
        ? `El REP referencia la factura pero el monto no coincide (esperado ${
          expectedAmount.toFixed(2)
        })`
        : `El REP no incluye la factura ${bill.cfdi_uuid}`;
      return jsonError(req, 400, msg);
    }

    // Verificar UUID único: no permitir el mismo REP en otro pago
    const { data: dup } = await supabase
      .from("supplier_payments")
      .select("id")
      .eq("rep_cfdi_uuid", repUuid)
      .neq("id", payment_id)
      .maybeSingle();
    if (dup) {
      return jsonError(
        req,
        409,
        `El UUID ${repUuid} ya está registrado en otro pago`,
      );
    }

    // Upload XML
    const xmlPath = `supplier-rep/${bill.id}/${payment_id}.xml`;
    const { error: xmlErr } = await supabase.storage.from(BUCKET).upload(
      xmlPath,
      new Blob([xmlText], { type: "application/xml" }),
      { contentType: "application/xml", upsert: true },
    );
    if (xmlErr) {
      return jsonError(req, 500, `No se pudo subir XML: ${xmlErr.message}`);
    }

    // Upload PDF (opcional, sin validar)
    let pdfPath: string | null = null;
    if (pdf_base64 && typeof pdf_base64 === "string") {
      try {
        const bin = atob(pdf_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const p = `supplier-rep/${bill.id}/${payment_id}.pdf`;
        const { error: pdfErr } = await supabase.storage.from(BUCKET).upload(
          p,
          bytes,
          { contentType: "application/pdf", upsert: true },
        );
        if (!pdfErr) pdfPath = p;
      } catch (e) {
        console.error("PDF upload failed:", e);
      }
    }

    // Update payment
    const { error: updErr } = await supabase
      .from("supplier_payments")
      .update({
        rep_status: "received",
        rep_cfdi_uuid: repUuid,
        rep_xml_url: xmlPath,
        rep_pdf_url: pdfPath,
        rep_received_at: new Date().toISOString(),
        rep_notes: null,
        rep_uploaded_by: userId,
      })
      .eq("id", payment_id);

    if (updErr) {
      return jsonError(req, 500, `No se pudo guardar: ${updErr.message}`);
    }

    // Activity feed (best effort)
    try {
      await supabase.from("activity_feed").insert({
        event_type: "supplier_payment.rep_uploaded",
        entity_type: "supplier_payments",
        entity_id: payment_id,
        title: "REP cargado",
        description:
          `Complemento de pago ${repUuid} cargado para la factura ${bill.cfdi_uuid}`,
        actor_id: userId,
      });
    } catch (e) {
      console.error("activity_feed insert failed:", e);
    }

    return jsonResponse(req, {
      success: true,
      rep_cfdi_uuid: repUuid,
      xml_url: xmlPath,
      pdf_url: pdfPath,
    });
  } catch (err) {
    console.error("validate-supplier-rep error:", err);
    return jsonError(req, 500, "Internal server error");
  }
});
