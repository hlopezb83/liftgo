/**
 * Validación de REP de proveedor (antes Edge Function validate-supplier-rep).
 * Mismas validaciones fiscales, mismos mensajes y el mismo bucket de storage.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "cfdi-files";
const TOLERANCE = 0.01;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (mismo cap que parse-csf)

// ---------- Helpers (parsing XML sin DOM) ----------

export function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "i",
  );
  const m = xml.match(re);
  return m?.[1] ?? null;
}

export function extractAllAttr(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "ig",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const value = m[1];
    if (value !== undefined) out.push(value);
  }
  return out;
}

// L-8: chequeo estructural mínimo de XML bien formado.
export function isWellFormedXml(xml: string): boolean {
  if (!/^\s*</.test(xml)) return false;
  const stack: string[] = [];
  const re =
    /<(\/?)([a-zA-Z_][\w.-]*(?::[\w.-]+)?)((?:"[^"]*"|'[^']*'|[^"'<>])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let sawRoot = false;
  while ((m = re.exec(xml)) !== null) {
    const closing = m[1];
    const name = m[2] ?? "";
    const selfClose = m[4];
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!selfClose) {
      stack.push(name);
      sawRoot = true;
    } else {
      sawRoot = true;
    }
  }
  return sawRoot && stack.length === 0;
}

export function extractPagoNodes(
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

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface ValidateSupplierRepInput {
  payment_id: string;
  xml_base64: string;
  pdf_base64?: string | null;
  force?: boolean;
}

export const validateSupplierRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ValidateSupplierRepInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin: supabase } = await g.requireRole(
      context.supabase,
      context.userId,
      ["admin", "administrativo"],
    );
    const userId = context.userId;
    // Mismo rate limit que parse-csf (5 req / 60s por usuario).
    await g.enforceRateLimit(supabase, "validate-supplier-rep", userId, 5, 60);

    const { payment_id, xml_base64, pdf_base64, force } = data ?? {};
    if (!g.isUUID(payment_id)) {
      throw new g.HttpError(400, "payment_id inválido");
    }
    if (!xml_base64 || typeof xml_base64 !== "string") {
      throw new g.HttpError(400, "xml_base64 es obligatorio");
    }
    if (xml_base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3)) {
      throw new g.HttpError(413, "El XML excede el tamaño máximo permitido (5MB)");
    }
    if (
      pdf_base64 != null && typeof pdf_base64 === "string" &&
      pdf_base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3)
    ) {
      throw new g.HttpError(413, "El PDF excede el tamaño máximo permitido (5MB)");
    }

    const { data: payment, error: payErr } = await supabase
      .from("supplier_payments")
      .select("id, bill_id, amount, rep_status, rep_required, rep_cfdi_uuid")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) throw new g.HttpError(404, "Pago no encontrado");
    if (!payment.rep_required) {
      throw new g.HttpError(400, "Este pago no requiere REP");
    }
    // N-32: no sobrescribir un REP ya validado sin intención explícita.
    if (payment.rep_status === "received" && payment.rep_cfdi_uuid && !force) {
      throw new g.HttpError(
        409,
        `Este pago ya tiene un REP validado (${payment.rep_cfdi_uuid}). Envía force=true para reemplazarlo.`,
      );
    }

    const { data: bill } = await supabase
      .from("supplier_bills")
      .select("id, cfdi_uuid, supplier_id, payment_method_sat, suppliers(rfc, name)")
      .eq("id", payment.bill_id)
      .single();
    if (!bill) throw new g.HttpError(404, "Factura no encontrada");
    if (!bill.cfdi_uuid) {
      throw new g.HttpError(400, "La factura no tiene UUID CFDI");
    }

    let xmlText: string;
    try {
      xmlText = new TextDecoder("utf-8").decode(base64ToBytes(xml_base64));
    } catch {
      throw new g.HttpError(400, "XML inválido (base64)");
    }

    if (!isWellFormedXml(xmlText)) {
      throw new g.HttpError(
        400,
        "XML malformado: el documento no está bien formado (tags desbalanceados o truncado)",
      );
    }

    const tipo = extractAttr(xmlText, "Comprobante", "TipoDeComprobante");
    if (tipo !== "P") {
      throw new g.HttpError(
        400,
        "El XML no es un Complemento de Pago (TipoDeComprobante distinto de P)",
      );
    }

    const rfcEmisor = extractAttr(xmlText, "Emisor", "Rfc");
    const supplierRfc = (bill.suppliers as { rfc?: string | null } | null)?.rfc
      ?.trim().toUpperCase();
    if (!supplierRfc) {
      throw new g.HttpError(400, "El proveedor no tiene RFC capturado");
    }
    if (!rfcEmisor || rfcEmisor.trim().toUpperCase() !== supplierRfc) {
      throw new g.HttpError(
        400,
        `RFC emisor (${rfcEmisor ?? "n/a"}) no coincide con el proveedor (${supplierRfc})`,
      );
    }

    const repUuid = extractAttr(xmlText, "TimbreFiscalDigital", "UUID");
    if (!repUuid || !g.isUUID(repUuid)) {
      throw new g.HttpError(400, "No se encontró UUID válido en TimbreFiscalDigital");
    }

    const pagos = extractPagoNodes(xmlText);
    if (pagos.length === 0) {
      throw new g.HttpError(400, "El XML no contiene nodos Pago");
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
      throw new g.HttpError(
        400,
        partial
          ? `El REP referencia la factura pero el monto no coincide (esperado ${
            expectedAmount.toFixed(2)
          })`
          : `El REP no incluye la factura ${bill.cfdi_uuid}`,
      );
    }

    const { data: dup } = await supabase
      .from("supplier_payments")
      .select("id")
      .eq("rep_cfdi_uuid", repUuid)
      .neq("id", payment_id)
      .maybeSingle();
    if (dup) {
      throw new g.HttpError(409, `El UUID ${repUuid} ya está registrado en otro pago`);
    }

    const xmlPath = `supplier-rep/${bill.id}/${payment_id}.xml`;
    const { error: xmlErr } = await supabase.storage.from(BUCKET).upload(
      xmlPath,
      new Blob([xmlText], { type: "application/xml" }),
      { contentType: "application/xml", upsert: true },
    );
    if (xmlErr) {
      throw new g.HttpError(500, `No se pudo subir XML: ${xmlErr.message}`);
    }

    let pdfPath: string | null = null;
    if (pdf_base64 && typeof pdf_base64 === "string") {
      try {
        const p = `supplier-rep/${bill.id}/${payment_id}.pdf`;
        const { error: pdfErr } = await supabase.storage.from(BUCKET).upload(
          p,
          base64ToBytes(pdf_base64),
          { contentType: "application/pdf", upsert: true },
        );
        if (!pdfErr) pdfPath = p;
      } catch (e) {
        console.error("PDF upload failed:", e);
      }
    }

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
      // N-32: carrera contra el índice único parcial de rep_cfdi_uuid.
      if ((updErr as { code?: string }).code === "23505") {
        throw new g.HttpError(
          409,
          `El UUID ${repUuid} ya está registrado en otro pago`,
        );
      }
      console.error("[validate-supplier-rep] supplier_payments update:", updErr);
      throw new g.HttpError(500, "No se pudo guardar el pago");
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

    return {
      success: true,
      rep_cfdi_uuid: repUuid,
      xml_url: xmlPath,
      pdf_url: pdfPath,
    };
  });
