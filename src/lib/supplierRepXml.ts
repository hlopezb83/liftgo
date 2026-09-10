/**
 * Utilidades de parseo de CFDI (REP) sin DOM, compartidas por la validación
 * de complementos de pago de proveedor.
 */
export const REP_BUCKET = "cfdi-files";
export const REP_TOLERANCE = 0.01;
export const REP_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (mismo cap que parse-csf)

export function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "i",
  );
  const m = xml.match(re);
  return m?.[1] ?? null;
}

export function extractAllAttr(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`,
    "ig",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const value = m[1];
    if (value !== undefined) out.push(value);
  }
  return out;
}

// L-8: chequeo estructural mínimo de XML bien formado.
export function isWellFormedXml(xml: string): boolean {
  if (!/^\s*</.test(xml)) return false;
  const stack: string[] = [];
  const re =
    /<(\/?)([a-zA-Z_][\w.-]*(?::[\w.-]+)?)((?:"[^"]*"|'[^']*'|[^"'<>])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let sawRoot = false;
  while ((m = re.exec(xml)) !== null) {
    const closing = m[1];
    const name = m[2] ?? "";
    const selfClose = m[4];
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!selfClose) {
      stack.push(name);
      sawRoot = true;
    } else {
      sawRoot = true;
    }
  }
  return sawRoot && stack.length === 0;
}

export function extractPagoNodes(
  xml: string,
): Array<{ monto: number; doctos: string[] }> {
  const reOpen = /<(?:[a-zA-Z0-9]+:)?Pago\b[^>]*>/g;
  const result: Array<{ monto: number; doctos: string[] }> = [];
  let m: RegExpExecArray | null;
  while ((m = reOpen.exec(xml)) !== null) {
    const start = m.index;
    const closeRe = /<\/(?:[a-zA-Z0-9]+:)?Pago>/g;
    closeRe.lastIndex = reOpen.lastIndex;
    const c = closeRe.exec(xml);
    if (!c) break;
    const block = xml.slice(start, c.index + c[0].length);
    const monto = Number(extractAttr(m[0], "Pago", "Monto") ?? "0");
    const doctos = extractAllAttr(block, "DoctoRelacionado", "IdDocumento");
    result.push({ monto, doctos });
  }
  return result;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

