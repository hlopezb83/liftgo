/**
 * B5-06: sanitizador compartido de términos de búsqueda para filtros
 * PostgREST `.ilike`/`.or()`. El término se interpola crudo dentro de `.or()`
 * — comas/paréntesis/comillas rompen la sintaxis del filtro, y `%`/`_` actúan
 * como wildcards de ILIKE. Se eliminan los caracteres de sintaxis y se
 * escapan los wildcards (PostgREST usa `\` como escape de LIKE).
 *
 * Extraído de `useEntitySearch.ts` (búsqueda global) para reutilizarse en
 * `invoiceListFilters.ts`, que sólo removía `%,()` y dejaba `_`/comillas sin
 * escapar.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,"'()]/g, "")
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
