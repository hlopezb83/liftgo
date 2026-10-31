/** Structural XML parsing shared with the legacy Edge endpoint. */
import { DOMParser, onWarningStopParsing } from "@xmldom/xmldom";
import { createRepXmlParser } from "../../supabase/functions/_shared/supplierRepXmlCore";
export { REP_MAX_FILE_BYTES } from "../../supabase/functions/_shared/supplierRepXmlCore";

export const REP_BUCKET = "cfdi-files";
export const REP_TOLERANCE = 0.01;

export const {
  extractAttr,
  extractAllAttr,
  extractPagoNodes,
  isWellFormedXml,
} = createRepXmlParser((xml) =>
  new DOMParser({ onError: onWarningStopParsing }).parseFromString(
    xml,
    "application/xml",
  ),
);

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
