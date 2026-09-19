import type { ParseResult } from "../../lib/bankParseUtils";

// Fix 6.3: archivos gigantes (tanto en bytes como en cantidad de líneas)
// congelaban la pestaña al intentar parsearlos/renderizarlos en el cliente.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PARSED_LINES = 50_000;

export function exceedsSizeLimit(file: File): boolean {
  return file.size > MAX_FILE_SIZE_BYTES;
}

export function tooManyLines(result: ParseResult): boolean {
  return result.lines.length > MAX_PARSED_LINES;
}
