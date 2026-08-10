// CFDI 4.0 XML parser puro — sin side-effects, sin Deno APIs, sin fetch.
// Extraído de index.ts para ser testeable en isolation con Deno.test.

export type ExpenseCategory =
  | "renta"
  | "nomina"
  | "software"
  | "depreciacion"
  | "otro"
  | "costo_venta"
  | "caja_chica"
  | "publicidad";

export const CATEGORIES: ExpenseCategory[] = [
  "renta",
  "nomina",
  "software",
  "depreciacion",
  "otro",
  "costo_venta",
  "caja_chica",
  "publicidad",
];

export type TipoComprobante = "I" | "E" | "N" | "P" | "T";

export interface ParsedCfdi {
  cfdi_uuid: string;
  total: number;
  subtotal: number;
  tax_amount: number;
  retention_iva: number;
  retention_isr: number;
  moneda: string;
  tipo_cambio: number;
  payment_method_sat: string;
  tipo_comprobante: TipoComprobante | null;
  fecha: string;
  folio: string;
  serie: string;
  emisor: { rfc: string; nombre: string; regimen_fiscal: string };
  receptor: {
    rfc: string;
    nombre: string;
    uso_cfdi: string;
    domicilio_fiscal: string;
    regimen_fiscal: string;
  };
  conceptos: Array<{ descripcion: string; clave_prod_serv: string }>;
}

const TIPO_COMPROBANTE_VALID: readonly TipoComprobante[] = [
  "I",
  "E",
  "N",
  "P",
  "T",
];

export function attr(tag: string, name: string): string | null {
  // Anclar al inicio del nombre del atributo: (^|whitespace|<) para evitar que
  // `attr(..., "Total")` matchee `SubTotal="..."` (bug pre-existente sin anchor).
  const re = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

export function findTag(xml: string, localName: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b[^>]*\\/?>`, "i");
  const m = xml.match(re);
  return m ? m[0] : null;
}

export function findAllTags(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b[^>]*\\/?>`, "gi");
  return xml.match(re) ?? [];
}

/**
 * H1/H2: fragmento del documento SIN el bloque <cfdi:Conceptos>.
 * En CFDI 4.0 cada <cfdi:Concepto> declara sus propios <cfdi:Impuestos>
 * (Traslados/Retenciones a nivel línea). Buscar tags sobre el documento
 * completo mezcla los impuestos de concepto con los GLOBALES del
 * Comprobante: el primer <cfdi:Impuestos> del documento es el de un
 * concepto (sin TotalImpuestosTrasladados) y las <cfdi:Retencion> se
 * duplican (concepto + comprobante).
 * El bloque <cfdi:Conceptos> es un wrapper único; al removerlo quedan
 * únicamente los nodos hijos directos del Comprobante (Emisor, Receptor,
 * Impuestos global, Complemento…), que es exactamente lo que parseamos.
 * Referencia de enfoque: src/features/accounts-payable/lib/parseCfdiXml.ts
 * (findChildByLocalName sobre el Element Comprobante).
 */
export function comprobanteSinConceptos(xml: string): string {
  return xml.replace(
    /<(?:[\w-]+:)?Conceptos\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?Conceptos>/i,
    "",
  );
}

export function parseCfdi(xml: string): ParsedCfdi {
  const comprobante = findTag(xml, "Comprobante");
  if (!comprobante) {
    throw new Error("XML no es un CFDI válido (sin nodo Comprobante)");
  }

  const tfd = findTag(xml, "TimbreFiscalDigital");
  const uuid = tfd ? attr(tfd, "UUID") : null;
  if (!uuid) throw new Error("CFDI sin timbre fiscal (UUID)");

  const emisorTag = findTag(xml, "Emisor");
  const receptorTag = findTag(xml, "Receptor");
  const conceptosTags = findAllTags(xml, "Concepto");

  const tipoRaw = attr(comprobante, "TipoDeComprobante");
  const tipo_comprobante: TipoComprobante | null =
    tipoRaw && (TIPO_COMPROBANTE_VALID as readonly string[]).includes(tipoRaw)
      ? (tipoRaw as TipoComprobante)
      : null;

  const fechaRaw = attr(comprobante, "Fecha") ?? "";
  const fecha = fechaRaw.slice(0, 10);

  // H1: el <cfdi:Impuestos> correcto es el hijo DIRECTO del Comprobante.
  // Sobre el fragmento sin Conceptos, el primer (y único) Impuestos es el
  // global, que es el que trae TotalImpuestosTrasladados/Retenidos.
  const globalFragment = comprobanteSinConceptos(xml);
  const impuestosTag = findTag(globalFragment, "Impuestos");
  const trasladosTotales = impuestosTag
    ? Number(attr(impuestosTag, "TotalImpuestosTrasladados") ?? "0")
    : 0;
  const retencionesIvaTotales = impuestosTag
    ? Number(attr(impuestosTag, "TotalImpuestosRetenidos") ?? "0")
    : 0;

  let retIva = 0;
  let retIsr = 0;
  // H2: solo las <cfdi:Retencion> del bloque <cfdi:Retenciones> GLOBAL
  // (hijo del Impuestos del Comprobante). Las de nivel concepto están en
  // el bloque Conceptos ya removido; sumarlas duplicaba el importe 2×.
  const retencionesBlock = globalFragment.match(
    /<(?:[\w-]+:)?Retenciones\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Retenciones>/i,
  );
  const retencionesTags = retencionesBlock
    ? findAllTags(retencionesBlock[1], "Retencion")
    : [];
  for (const t of retencionesTags) {
    const impuesto = attr(t, "Impuesto");
    const importe = Number(attr(t, "Importe") ?? "0");
    if (impuesto === "002") retIva += importe;
    else if (impuesto === "001") retIsr += importe;
  }
  // Fallback SOLO si el bloque global no declaró hijos Retencion: el SAT
  // garantiza que TotalImpuestosRetenidos = Σ Retencion.Importe global,
  // así que nunca deben sumarse ambos (esa era la duplicación).
  if (retIva === 0 && retIsr === 0 && retencionesIvaTotales > 0) {
    retIva = retencionesIvaTotales;
  }

  return {
    cfdi_uuid: uuid.toLowerCase(),
    total: Number(attr(comprobante, "Total") ?? "0"),
    subtotal: Number(attr(comprobante, "SubTotal") ?? "0"),
    tax_amount: trasladosTotales,
    retention_iva: retIva,
    retention_isr: retIsr,
    moneda: attr(comprobante, "Moneda") ?? "MXN",
    tipo_cambio: Number(attr(comprobante, "TipoCambio") ?? "1"),
    payment_method_sat: attr(comprobante, "MetodoPago") ?? "PUE",
    tipo_comprobante,
    fecha,
    folio: attr(comprobante, "Folio") ?? "",
    serie: attr(comprobante, "Serie") ?? "",
    emisor: {
      rfc: (emisorTag ? attr(emisorTag, "Rfc") : null) ?? "",
      nombre: (emisorTag ? attr(emisorTag, "Nombre") : null) ?? "",
      regimen_fiscal: (emisorTag ? attr(emisorTag, "RegimenFiscal") : null) ??
        "",
    },
    receptor: {
      rfc: (receptorTag ? attr(receptorTag, "Rfc") : null) ?? "",
      nombre: (receptorTag ? attr(receptorTag, "Nombre") : null) ?? "",
      uso_cfdi: (receptorTag ? attr(receptorTag, "UsoCFDI") : null) ?? "",
      domicilio_fiscal:
        (receptorTag ? attr(receptorTag, "DomicilioFiscalReceptor") : null) ??
          "",
      regimen_fiscal:
        (receptorTag ? attr(receptorTag, "RegimenFiscalReceptor") : null) ?? "",
    },
    conceptos: conceptosTags.map((t) => ({
      descripcion: attr(t, "Descripcion") ?? "",
      clave_prod_serv: attr(t, "ClaveProdServ") ?? "",
    })),
  };
}
