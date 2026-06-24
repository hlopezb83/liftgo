/**
 * Parser de CFDI 4.0 (XML SAT) para Facturas de Proveedor.
 * Extrae los campos requeridos por `supplier_bills` desde el XML.
 */

export interface CfdiParsed {
  uuid: string | null;
  serie: string | null;
  folio: string | null;
  issueDate: Date | null;
  currency: "MXN" | "USD";
  exchangeRate: number;
  subtotal: number;
  taxAmount: number;
  retentionIva: number;
  retentionIsr: number;
  total: number;
  paymentMethodSat: "PUE" | "PPD" | null;
  formaPago: string | null;
  emitterRfc: string | null;
  emitterName: string | null;
  receiverRfc: string | null;
  comprobanteType: string | null;
}

export class CfdiParseError extends Error {}

function num(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Obtiene primer elemento por localName ignorando prefijo de namespace. */
function findByLocalName(root: Element | Document, localName: string): Element | null {
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i];
  }
  return null;
}

function findAllByLocalName(root: Element | Document, localName: string): Element[] {
  const out: Element[] = [];
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
}

function sumImpuestos(root: Element, kind: "Traslados" | "Retenciones"): number {
  const parents = findAllByLocalName(root, kind);
  let total = 0;
  for (const parent of parents) {
    const items = Array.from(parent.children).filter((c) =>
      c.localName === (kind === "Traslados" ? "Traslado" : "Retencion"),
    );
    for (const item of items) {
      total += num(item.getAttribute("Importe"));
    }
  }
  return total;
}

function sumRetencionByImpuesto(root: Element, impuestoCode: "001" | "002"): number {
  // 001 = ISR, 002 = IVA según catálogo SAT
  const parents = findAllByLocalName(root, "Retenciones");
  let total = 0;
  for (const parent of parents) {
    const items = Array.from(parent.children).filter((c) => c.localName === "Retencion");
    for (const item of items) {
      if (item.getAttribute("Impuesto") === impuestoCode) {
        total += num(item.getAttribute("Importe"));
      }
    }
  }
  return total;
}

export function parseCfdiXml(xml: string): CfdiParsed {
  const trimmed = xml.trim();
  if (!trimmed) throw new CfdiParseError("XML vacío");

  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new CfdiParseError("El archivo XML está mal formado");
  }

  const comprobante = doc.documentElement;
  if (!comprobante || comprobante.localName !== "Comprobante") {
    throw new CfdiParseError("No es un CFDI válido (falta nodo Comprobante)");
  }

  const tipo = comprobante.getAttribute("TipoDeComprobante");
  if (tipo && tipo !== "I") {
    throw new CfdiParseError(`Solo se aceptan CFDI de Ingreso (I). Este es tipo "${tipo}".`);
  }

  const emisor = findByLocalName(comprobante, "Emisor");
  const receptor = findByLocalName(comprobante, "Receptor");
  const timbre = findByLocalName(comprobante, "TimbreFiscalDigital");

  const monedaAttr = comprobante.getAttribute("Moneda");
  const currency: "MXN" | "USD" = monedaAttr === "USD" ? "USD" : "MXN";
  const exchangeRate = num(comprobante.getAttribute("TipoCambio")) || 1;

  // Sumar impuestos trasladados (IVA principalmente).
  const taxAmount = sumImpuestos(comprobante, "Traslados");
  const retentionIva = sumRetencionByImpuesto(comprobante, "002");
  const retentionIsr = sumRetencionByImpuesto(comprobante, "001");

  const metodoPago = comprobante.getAttribute("MetodoPago");
  const paymentMethodSat: "PUE" | "PPD" | null =
    metodoPago === "PUE" || metodoPago === "PPD" ? metodoPago : null;

  return {
    uuid: timbre?.getAttribute("UUID")?.toUpperCase() ?? null,
    serie: comprobante.getAttribute("Serie"),
    folio: comprobante.getAttribute("Folio"),
    issueDate: parseIsoDate(comprobante.getAttribute("Fecha")),
    currency,
    exchangeRate,
    subtotal: num(comprobante.getAttribute("SubTotal")),
    taxAmount,
    retentionIva,
    retentionIsr,
    total: num(comprobante.getAttribute("Total")),
    paymentMethodSat,
    formaPago: comprobante.getAttribute("FormaPago"),
    emitterRfc: emisor?.getAttribute("Rfc")?.toUpperCase() ?? null,
    emitterName: emisor?.getAttribute("Nombre") ?? null,
    receiverRfc: receptor?.getAttribute("Rfc")?.toUpperCase() ?? null,
    comprobanteType: tipo,
  };
}
