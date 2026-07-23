/**
 * Parser de CFDI 4.0 (XML SAT) para Facturas de Proveedor.
 * Extrae los campos requeridos por `supplier_bills` desde el XML.
 *
 * NOTA IMPORTANTE: los impuestos se leen únicamente del nodo
 * `<cfdi:Impuestos>` hijo directo del `<cfdi:Comprobante>` (totales
 * oficiales del CFDI). Si se recorriera todo el documento se
 * duplicarían, porque cada `<cfdi:Concepto>` también declara sus
 * propios `<cfdi:Traslados>` / `<cfdi:Retenciones>`.
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
  // R10 Bloque 12.10: el CFDI trae Fecha en formato local sin zona
  // (YYYY-MM-DDTHH:mm:ss). `new Date(str)` interpreta ese string como hora
  // local del navegador, lo que corre la fecha fiscal si el usuario está en
  // otra zona horaria. Forzamos zona local México (o UTC como fallback)
  // preservando la fecha calendario que emitió el emisor.
  const trimmed = value.trim();
  // Solo fecha (date-only): YYYY-MM-DD
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (dateOnly) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // Fecha y hora local (sin zona): YYYY-MM-DDTHH:mm:ss(.sss)?
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(trimmed);
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}


function findChildByLocalName(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child;
  }
  return null;
}

function findChildrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.localName === localName);
}

function findFirstDescendant(root: Element | Document, localName: string): Element | null {
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i];
  }
  return null;
}

/** Suma los importes de los hijos directos `Traslado`/`Retencion` del wrapper. */
function sumDirectImporte(wrapper: Element | null, childLocalName: "Traslado" | "Retencion"): number {
  if (!wrapper) return 0;
  let total = 0;
  for (const item of findChildrenByLocalName(wrapper, childLocalName)) {
    total += num(item.getAttribute("Importe"));
  }
  return total;
}

function sumRetencionByImpuesto(
  retencionesWrapper: Element | null,
  impuestoCode: "001" | "002",
): number {
  if (!retencionesWrapper) return 0;
  let total = 0;
  for (const item of findChildrenByLocalName(retencionesWrapper, "Retencion")) {
    if (item.getAttribute("Impuesto") === impuestoCode) {
      total += num(item.getAttribute("Importe"));
    }
  }
  return total;
}

function parseAndValidateDoc(xml: string): Element {
  const trimmed = xml.trim();
  if (!trimmed) throw new CfdiParseError("XML vacío");

  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) throw new CfdiParseError("El archivo XML está mal formado");

  const comprobante = doc.documentElement;
  if (!comprobante || comprobante.localName !== "Comprobante") {
    throw new CfdiParseError("No es un CFDI válido (falta nodo Comprobante)");
  }

  const tipo = comprobante.getAttribute("TipoDeComprobante");
  if (tipo && tipo !== "I") {
    throw new CfdiParseError(`Solo se aceptan CFDI de Ingreso (I). Este es tipo "${tipo}".`);
  }
  return comprobante;
}

function extractCurrency(comprobante: Element): { currency: "MXN" | "USD"; exchangeRate: number } {
  const monedaAttr = comprobante.getAttribute("Moneda");
  const currency: "MXN" | "USD" = monedaAttr === "USD" ? "USD" : "MXN";
  const exchangeRate = num(comprobante.getAttribute("TipoCambio")) || 1;
  return { currency, exchangeRate };
}

function extractImpuestos(comprobante: Element): {
  taxAmount: number; retentionIva: number; retentionIsr: number;
} {
  // Solo el nodo hijo directo (totales oficiales del CFDI).
  const impuestosNode = findChildByLocalName(comprobante, "Impuestos");
  const trasladosWrapper = impuestosNode ? findChildByLocalName(impuestosNode, "Traslados") : null;
  const retencionesWrapper = impuestosNode ? findChildByLocalName(impuestosNode, "Retenciones") : null;

  const totalTrasladadosAttr = impuestosNode?.getAttribute("TotalImpuestosTrasladados");
  const taxAmount = totalTrasladadosAttr !== null && totalTrasladadosAttr !== undefined
    ? num(totalTrasladadosAttr)
    : sumDirectImporte(trasladosWrapper, "Traslado");

  return {
    taxAmount,
    retentionIva: sumRetencionByImpuesto(retencionesWrapper, "002"),
    retentionIsr: sumRetencionByImpuesto(retencionesWrapper, "001"),
  };
}

function extractPaymentMethod(comprobante: Element): "PUE" | "PPD" | null {
  const metodoPago = comprobante.getAttribute("MetodoPago");
  return metodoPago === "PUE" || metodoPago === "PPD" ? metodoPago : null;
}

export function parseCfdiXml(xml: string): CfdiParsed {
  const comprobante = parseAndValidateDoc(xml);
  const emisor = findChildByLocalName(comprobante, "Emisor");
  const receptor = findChildByLocalName(comprobante, "Receptor");
  const timbre = findFirstDescendant(comprobante, "TimbreFiscalDigital");

  const { currency, exchangeRate } = extractCurrency(comprobante);
  const { taxAmount, retentionIva, retentionIsr } = extractImpuestos(comprobante);

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
    paymentMethodSat: extractPaymentMethod(comprobante),
    formaPago: comprobante.getAttribute("FormaPago"),
    emitterRfc: emisor?.getAttribute("Rfc")?.toUpperCase() ?? null,
    emitterName: emisor?.getAttribute("Nombre") ?? null,
    receiverRfc: receptor?.getAttribute("Rfc")?.toUpperCase() ?? null,
    comprobanteType: comprobante.getAttribute("TipoDeComprobante"),
  };
}

