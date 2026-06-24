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
  const d = new Date(value);
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

  const emisor = findChildByLocalName(comprobante, "Emisor");
  const receptor = findChildByLocalName(comprobante, "Receptor");
  const timbre = findFirstDescendant(comprobante, "TimbreFiscalDigital");

  const monedaAttr = comprobante.getAttribute("Moneda");
  const currency: "MXN" | "USD" = monedaAttr === "USD" ? "USD" : "MXN";
  const exchangeRate = num(comprobante.getAttribute("TipoCambio")) || 1;

  // Impuestos: SOLO el nodo hijo directo del Comprobante (totales oficiales).
  // Recorrer todos los descendientes duplicaría con los impuestos por concepto.
  const impuestosNode = findChildByLocalName(comprobante, "Impuestos");
  const trasladosWrapper = impuestosNode ? findChildByLocalName(impuestosNode, "Traslados") : null;
  const retencionesWrapper = impuestosNode ? findChildByLocalName(impuestosNode, "Retenciones") : null;

  // Preferir atributos agregados del PAC cuando estén presentes.
  const totalTrasladadosAttr = impuestosNode?.getAttribute("TotalImpuestosTrasladados");
  const taxAmount = totalTrasladadosAttr !== null && totalTrasladadosAttr !== undefined
    ? num(totalTrasladadosAttr)
    : sumDirectImporte(trasladosWrapper, "Traslado");

  const retentionIva = sumRetencionByImpuesto(retencionesWrapper, "002");
  const retentionIsr = sumRetencionByImpuesto(retencionesWrapper, "001");

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
