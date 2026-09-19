/**
 * Validaciones puras del REP de proveedor (entrada y XML).
 *
 * Sin acceso a base de datos ni a Storage: recibe las guardas (`HttpError`,
 * `isUUID`) por parámetro para poder probarse sin cliente privilegiado y para
 * no importar módulos `.server` desde código que llega al bundle del cliente.
 */
import {
  base64ToBytes,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
  REP_MAX_FILE_BYTES as MAX_FILE_BYTES,
  REP_TOLERANCE as TOLERANCE,
} from "./supplierRepXml";

type AdminGuards = typeof import("./server/adminGuards.server");

/** Subconjunto de guardas que necesitan las validaciones puras. */
export type RepGuards = Pick<AdminGuards, "HttpError" | "isUUID">;

export interface ValidateSupplierRepInput {
  payment_id: string;
  xml_base64: string;
  pdf_base64?: string | null;
  force?: boolean;
}

export const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES * 4 / 3);

export function validateRepInput(
  g: RepGuards,
  data: ValidateSupplierRepInput,
): void {
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

export function decodeRepXml(g: RepGuards, xmlBase64: string): string {
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

export function assertEmisorMatchesSupplier(
  g: RepGuards,
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
export function assertPagoMatchesInvoice(
  g: RepGuards,
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

/** Extrae y valida el UUID del TimbreFiscalDigital del REP. */
export function extractRepUuid(g: RepGuards, xmlText: string): string {
  const repUuid = extractAttr(xmlText, "TimbreFiscalDigital", "UUID");
  if (!repUuid || !g.isUUID(repUuid)) {
    throw new g.HttpError(400, "No se encontró UUID válido en TimbreFiscalDigital");
  }
  return repUuid;
}
