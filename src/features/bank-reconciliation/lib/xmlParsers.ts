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

const NEGATIVE_KINDS = ["cargo", "retiro", "debito"];
const POSITIVE_KINDS = ["abono", "deposito", "credito"];

function applyKindSign(amount: number, kind: string): number {
  if (NEGATIVE_KINDS.some((k) => kind.startsWith(k))) return -Math.abs(amount);
  if (POSITIVE_KINDS.some((k) => kind.startsWith(k))) return Math.abs(amount);
  return amount;
}

function fieldAmount(f: Record<string, string>, key: string | undefined): number | null {
  return key ? parseAmount(f[key] ?? "") : null;
}

function signedFor(f: Record<string, string>, map: XmlFieldMapping): number | null {
  const charge = fieldAmount(f, map.charge);
  const credit = fieldAmount(f, map.credit);
  if (charge !== null || credit !== null) return signedFromChargeCredit(charge, credit);
  const amount = fieldAmount(f, map.amount);
  if (amount === null) return null;
  return applyKindSign(amount, map.type ? normalizeKey(f[map.type] ?? "") : "");
}

function mappingErrors(map: XmlFieldMapping): string[] {
  const errors: string[] = [];
  if (!map.date) errors.push("No se identificó el campo de fecha. Asigna el mapeo manualmente.");
  if (!map.amount && !map.charge && !map.credit) {
    errors.push("No se identificó el campo de importe. Asigna el mapeo manualmente.");
  }
  return errors;
}

function mapNodeToLine(f: Record<string, string>, map: XmlFieldMapping, index: number) {
  const rawDate = f[map.date ?? ""] ?? "";
  const postedDate = parseDateFlexible(rawDate);
  if (!postedDate) return `Movimiento ${index + 1}: fecha inválida ("${rawDate}")`;
  const signed = signedFor(f, map);
  if (signed === null || signed === 0) return `Movimiento ${index + 1}: importe inválido o cero`;
  const description = (map.description ? f[map.description] ?? "" : "").trim() || "Movimiento bancario";
  const reference = map.reference ? (f[map.reference] ?? "").trim() || null : null;
  return buildLine({ postedDate, description, signedAmount: signed, reference });
}

const EMPTY_RESULT: XmlParseResult = {
  lines: [], errors: [], periodStart: null, periodEnd: null, detectedMapping: {}, availableFields: [],
};

function readDocument(content: string): Document | string {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, "application/xml");
  } catch {
    return "El archivo XML no se pudo leer.";
  }
  if (doc.getElementsByTagName("parsererror").length > 0 || !doc.documentElement) {
    return "El archivo XML está mal formado.";
  }
  return doc;
}

export function parseBankXml(content: string, override: XmlFieldMapping = {}): XmlParseResult {
  const doc = readDocument(content);
  if (typeof doc === "string") return { ...EMPTY_RESULT, errors: [doc] };

  const nodes = detectMovementNodes(doc);
  if (nodes.length === 0) {
    return { ...EMPTY_RESULT, errors: ["No se encontraron movimientos repetidos en el XML."] };
  }

  const parsedNodes = nodes.map(nodeFields);
  const availableFields = Array.from(new Set(parsedNodes.flatMap((f) => Object.keys(f)))).sort();
  const detectedMapping = detectMapping(availableFields);
  const mapping: XmlFieldMapping = { ...detectedMapping, ...override };

  const setupErrors = mappingErrors(mapping);
  if (setupErrors.length > 0) {
    return { ...EMPTY_RESULT, errors: setupErrors, detectedMapping, availableFields };
  }

  const errors: string[] = [];
  const lines = [];
  for (let i = 0; i < parsedNodes.length; i++) {
    const result = mapNodeToLine(parsedNodes[i], mapping, i);
    if (typeof result === "string") { errors.push(result); continue; }
    lines.push(result);
  }

  return { lines, errors, ...computePeriod(lines), detectedMapping, availableFields };
}
