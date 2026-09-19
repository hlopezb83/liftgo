import type { XmlFieldMapping } from "../../lib/xmlParsers";

/** Único punto que toca localStorage para recordar el mapeo XML por cuenta. */
const mappingKey = (bankAccountId: string) => `liftgo:bank-xml-mapping:${bankAccountId}`;

export function loadMapping(bankAccountId: string): XmlFieldMapping {
  try {
    const raw = localStorage.getItem(mappingKey(bankAccountId));
    return raw ? (JSON.parse(raw) as XmlFieldMapping) : {};
  } catch {
    return {};
  }
}

export function saveMapping(bankAccountId: string, mapping: XmlFieldMapping) {
  try {
    localStorage.setItem(mappingKey(bankAccountId), JSON.stringify(mapping));
  } catch {
    /* almacenamiento no disponible: el mapeo simplemente no se recuerda */
  }
}
