/**
 * Validación de REP de proveedor (antes Edge Function validate-supplier-rep).
 * Mismas validaciones fiscales, mismos mensajes y el mismo bucket de storage.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  base64ToBytes,
  extractAllAttr,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
  REP_BUCKET as BUCKET,
  REP_MAX_FILE_BYTES as MAX_FILE_BYTES,
  REP_TOLERANCE as TOLERANCE,
} from "./supplierRepXml";

// Reexportados para las pruebas y consumidores existentes.
export { extractAllAttr, extractAttr, extractPagoNodes, isWellFormedXml };

export interface ValidateSupplierRepInput {
  payment_id: string;
  xml_base64: string;
  pdf_base64?: string | null;
  force?: boolean;
}

type Guards = typeof import("./server/adminGuards.server");
type AdminClient = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES * 4 / 3);

function validateRepInput(g: Guards, data: ValidateSupplierRepInput): void {
  const { payment_id, xml_base64, pdf_base64 } = data ?? {};
  if (!g.isUUID(payment_id)) {
    throw new g.HttpError(400, "payment_id inválido");
  }
  if (!xml_base64 || typeof xml_base64 !== "string") {
    throw new g.HttpError(400, "xml_base64 es obligatorio");
  }
  if (xml_base64.length > MAX_BASE64_CHARS) {
    throw new g.HttpError(413, "El XML excede el tamaño máximo permitido (5MB)");
  }
  if (typeof pdf_base64 === "string" && pdf_base64.length > MAX_BASE64_CHARS) {
    throw new g.HttpError(413, "El PDF excede el tamaño máximo permitido (5MB)");
  }
}

/** Carga el pago y su factura, aplicando las guardas de estado (N-32). */
async function loadPaymentAndBill(
  g: Guards,
  supabase: AdminClient,
  paymentId: string,
  force: boolean | undefined,
) {
  const { data: payment, error: payErr } = await supabase
    .from("supplier_payments")
    .select("id, bill_id, amount, rep_status, rep_required, rep_cfdi_uuid")
    .eq("id", paymentId)
    .single();
  if (payErr || !payment) throw new g.HttpError(404, "Pago no encontrado");
  if (!payment.rep_required) {
    throw new g.HttpError(400, "Este pago no requiere REP");
  }
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
  return { payment, bill, billUuid: bill.cfdi_uuid };
}

function decodeRepXml(g: Guards, xmlBase64: string): string {
  let xmlText: string;
  try {
    xmlText = new TextDecoder("utf-8").decode(base64ToBytes(xmlBase64));
  } catch {
    throw new g.HttpError(400, "XML inválido (base64)");
  }
  if (!isWellFormedXml(xmlText)) {
    throw new g.HttpError(
      400,
      "XML malformado: el documento no está bien formado (tags desbalanceados o truncado)",
    );
  }
  if (extractAttr(xmlText, "Comprobante", "TipoDeComprobante") !== "P") {
    throw new g.HttpError(
      400,
      "El XML no es un Complemento de Pago (TipoDeComprobante distinto de P)",
    );
  }
  return xmlText;
}

function assertEmisorMatchesSupplier(
  g: Guards,
  xmlText: string,
  suppliers: { rfc?: string | null } | null,
): void {
  const rfcEmisor = extractAttr(xmlText, "Emisor", "Rfc");
  const supplierRfc = suppliers?.rfc?.trim().toUpperCase();
  if (!supplierRfc) {
    throw new g.HttpError(400, "El proveedor no tiene RFC capturado");
  }
  if (!rfcEmisor || rfcEmisor.trim().toUpperCase() !== supplierRfc) {
    throw new g.HttpError(
      400,
      `RFC emisor (${rfcEmisor ?? "n/a"}) no coincide con el proveedor (${supplierRfc})`,
    );
  }
}

/** Verifica que algún nodo Pago referencie la factura por el monto esperado. */
function assertPagoMatchesInvoice(
  g: Guards,
  xmlText: string,
  billUuid: string,
  expectedAmount: number,
): void {
  const pagos = extractPagoNodes(xmlText);
  if (pagos.length === 0) {
    throw new g.HttpError(400, "El XML no contiene nodos Pago");
  }
  const targetUuid = billUuid.toLowerCase();
  const referencesBill = (doctos: string[]) =>
    doctos.some((d) => d.toLowerCase() === targetUuid);
  const match = pagos.find((p) =>
    referencesBill(p.doctos) && Math.abs(p.monto - expectedAmount) <= TOLERANCE
  );
  if (match) return;

  const partial = pagos.some((p) => referencesBill(p.doctos));
  throw new g.HttpError(
    400,
    partial
      ? `El REP referencia la factura pero el monto no coincide (esperado ${
        expectedAmount.toFixed(2)
      })`
      : `El REP no incluye la factura ${billUuid}`,
  );
}

async function uploadRepFiles(
  g: Guards,
  supabase: AdminClient,
  billId: string,
  paymentId: string,
  xmlText: string,
  pdfBase64: string | null | undefined,
): Promise<{ xmlPath: string; pdfPath: string | null }> {
  const xmlPath = `supplier-rep/${billId}/${paymentId}.xml`;
  const { error: xmlErr } = await supabase.storage.from(BUCKET).upload(
    xmlPath,
    new Blob([xmlText], { type: "application/xml" }),
    { contentType: "application/xml", upsert: true },
  );
  if (xmlErr) {
    throw new g.HttpError(500, `No se pudo subir XML: ${xmlErr.message}`);
  }

  if (typeof pdfBase64 !== "string" || !pdfBase64) return { xmlPath, pdfPath: null };
  try {
    const p = `supplier-rep/${billId}/${paymentId}.pdf`;
    const { error: pdfErr } = await supabase.storage.from(BUCKET).upload(
      p,
      base64ToBytes(pdfBase64),
      { contentType: "application/pdf", upsert: true },
    );
    return { xmlPath, pdfPath: pdfErr ? null : p };
  } catch (e) {
    console.error("PDF upload failed:", e);
    return { xmlPath, pdfPath: null };
  }
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
    validateRepInput(g, data);

    const { payment, bill, billUuid } = await loadPaymentAndBill(
      g,
      supabase,
      payment_id,
      force,
    );

    const xmlText = decodeRepXml(g, xml_base64);
    assertEmisorMatchesSupplier(
      g,
      xmlText,
      bill.suppliers as { rfc?: string | null } | null,
    );

    const repUuid = extractAttr(xmlText, "TimbreFiscalDigital", "UUID");
    if (!repUuid || !g.isUUID(repUuid)) {
      throw new g.HttpError(400, "No se encontró UUID válido en TimbreFiscalDigital");
    }

    assertPagoMatchesInvoice(g, xmlText, billUuid, Number(payment.amount));

    const { data: dup } = await supabase
      .from("supplier_payments")
      .select("id")
      .eq("rep_cfdi_uuid", repUuid)
      .neq("id", payment_id)
      .maybeSingle();
    if (dup) {
      throw new g.HttpError(409, `El UUID ${repUuid} ya está registrado en otro pago`);
    }

    const { xmlPath, pdfPath } = await uploadRepFiles(
      g,
      supabase,
      bill.id,
      payment_id,
      xmlText,
      pdf_base64,
    );

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
