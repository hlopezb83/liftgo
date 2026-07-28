import {
  buildLine,
  computePeriod,
  parseAmount,
  parseDateFlexible,
  signedFromChargeCredit,
  type ParseResult,
} from "./bankParseUtils";

export type XmlFieldKey = "date" | "description" | "charge" | "credit" | "amount" | "reference" | "type";
export type XmlFieldMapping = Partial<Record<XmlFieldKey, string>>;

export interface XmlParseResult extends ParseResult {
  detectedMapping: XmlFieldMapping;
  availableFields: string[];
}

const SYNONYMS: Record<XmlFieldKey, string[]> = {
  date: ["fecha", "fechaoperacion", "fechamovimiento", "fechaliquidacion", "fechaaplicacion", "fechavalor", "date"],
  description: ["concepto", "descripcion", "detalle", "leyenda", "conceptomovimiento", "description"],
  charge: ["retiro", "cargo", "debito", "importeretiro", "retiros", "cargos", "montoretiro"],
  credit: ["deposito", "abono", "credito", "importedeposito", "depositos", "abonos", "montodeposito"],
  amount: ["importe", "monto", "amount", "importemovimiento", "montomovimiento", "valor"],
  reference: ["referencia", "folio", "numeroreferencia", "clavetraspaso", "referencianumerica", "reference"],
  type: ["tipo", "tipomovimiento", "naturaleza", "tipooperacion"],
};

/** Normaliza: sin namespace, sin acentos, sin separadores, minúsculas. */
export function normalizeKey(raw: string): string {
  const parts = raw.split(":");
  const local = parts[parts.length - 1] ?? raw;
  return local
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** Campos de un nodo: atributos + hijos hoja con texto. */
function nodeFields(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    out[normalizeKey(attr.name)] = attr.value;
  }
  for (const child of Array.from(el.children)) {
    if (child.children.length > 0) continue;
    const key = normalizeKey(child.tagName);
    const text = (child.textContent ?? "").trim();
    if (text && !out[key]) out[key] = text;
  }
  return out;
}

/** Elige el grupo de hermanos repetidos más numeroso que tenga datos. */
function detectMovementNodes(doc: Document): Element[] {
  let best: Element[] = [];
  const all = [doc.documentElement, ...Array.from(doc.getElementsByTagName("*"))];
  for (const parent of all) {
    if (!parent) continue;
    const groups = new Map<string, Element[]>();
    for (const child of Array.from(parent.children)) {
      const key = normalizeKey(child.tagName);
      const list = groups.get(key) ?? [];
      list.push(child);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2 || list.length <= best.length) continue;
      if (Object.keys(nodeFields(list[0])).length === 0) continue;
      best = list;
    }
  }
  return best;
}

function detectMapping(fields: string[]): XmlFieldMapping {
  const mapping: XmlFieldMapping = {};
  for (const key of Object.keys(SYNONYMS) as XmlFieldKey[]) {
    const found = SYNONYMS[key].find((syn) => fields.includes(syn));
    if (found) mapping[key] = found;
  }
  return mapping;
}

function signedFor(f: Record<string, string>, map: XmlFieldMapping): number | null {
  if (map.charge || map.credit) {
    const charge = map.charge ? parseAmount(f[map.charge] ?? "") : null;
    const credit = map.credit ? parseAmount(f[map.credit] ?? "") : null;
    if (charge !== null || credit !== null) return signedFromChargeCredit(charge, credit);
  }
  if (!map.amount) return null;
  const amount = parseAmount(f[map.amount] ?? "");
  if (amount === null) return null;
  const kind = map.type ? normalizeKey(f[map.type] ?? "") : "";
  if (kind.startsWith("cargo") || kind.startsWith("retiro") || kind.startsWith("debito")) return -Math.abs(amount);
  if (kind.startsWith("abono") || kind.startsWith("deposito") || kind.startsWith("credito")) return Math.abs(amount);
  return amount;
}

export function parseBankXml(content: string, override: XmlFieldMapping = {}): XmlParseResult {
  const empty: XmlParseResult = {
    lines: [], errors: [], periodStart: null, periodEnd: null, detectedMapping: {}, availableFields: [],
  };
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, "application/xml");
  } catch {
    return { ...empty, errors: ["El archivo XML no se pudo leer."] };
  }
  if (doc.getElementsByTagName("parsererror").length > 0 || !doc.documentElement) {
    return { ...empty, errors: ["El archivo XML está mal formado."] };
  }

  const nodes = detectMovementNodes(doc);
  if (nodes.length === 0) {
    return { ...empty, errors: ["No se encontraron movimientos repetidos en el XML."] };
  }

  const parsedNodes = nodes.map(nodeFields);
  const availableFields = Array.from(new Set(parsedNodes.flatMap((f) => Object.keys(f)))).sort();
  const detectedMapping = detectMapping(availableFields);
  const mapping: XmlFieldMapping = { ...detectedMapping, ...override };

  const errors: string[] = [];
  if (!mapping.date) errors.push("No se identificó el campo de fecha. Asigna el mapeo manualmente.");
  if (!mapping.amount && !mapping.charge && !mapping.credit) {
    errors.push("No se identificó el campo de importe. Asigna el mapeo manualmente.");
  }
  if (errors.length > 0) return { ...empty, errors, detectedMapping, availableFields };

  const lines = [];
  for (let i = 0; i < parsedNodes.length; i++) {
    const f = parsedNodes[i];
    const postedDate = parseDateFlexible(f[mapping.date ?? ""] ?? "");
    if (!postedDate) { errors.push(`Movimiento ${i + 1}: fecha inválida ("${f[mapping.date ?? ""] ?? ""}")`); continue; }
    const signed = signedFor(f, mapping);
    if (signed === null || signed === 0) { errors.push(`Movimiento ${i + 1}: importe inválido o cero`); continue; }
    const description = (mapping.description ? f[mapping.description] ?? "" : "").trim() || "Movimiento bancario";
    const reference = mapping.reference ? (f[mapping.reference] ?? "").trim() || null : null;
    lines.push(buildLine({ postedDate, description, signedAmount: signed, reference }));
  }

  return { lines, errors, ...computePeriod(lines), detectedMapping, availableFields };
}
