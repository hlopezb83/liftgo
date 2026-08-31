/**
 * B5-07: `file.text()` fuerza UTF-8. Un estado de cuenta exportado en
 * Windows-1252 (típico de bancos mexicanos vía Excel) trae acentos/ñ como
 * bytes fuera de rango UTF-8; decodificado como UTF-8 se vuelve mojibake
 * silencioso (referencias/descripciones corruptas).
 *
 * Estrategia: decodificar con UTF-8 estricto (`fatal: true`); si falla, o si
 * el resultado contiene el carácter de reemplazo U+FFFD (señal de bytes
 * inválidos que el decoder "estricto" no detectó, p. ej. streams truncados),
 * reintentar con `windows-1252`.
 */
export async function decodeStatementFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (!utf8.includes("\uFFFD")) return utf8;
  } catch {
    /* cae a windows-1252 abajo */
  }
  return new TextDecoder("windows-1252").decode(buffer);
}
