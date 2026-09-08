/** Parsing de URLs compartido por el shim de navegación (hooks y componentes). */
export function parseTo(to: string): { pathname: string; search?: Record<string, string>; hash?: string } {
  const [beforeHash, hashStr] = (to ?? "").split("#");
  const [pathname, searchStr] = beforeHash.split("?");
  return {
    // react-router keeps the current path for search-only ("?a=1") and
    // hash-only ("#section") targets; TanStack's "." means current route.
    pathname: pathname || ".",
    search: searchStr ? Object.fromEntries(new URLSearchParams(searchStr)) : undefined,
    hash: hashStr || undefined,
  };
}

/**
 * Contrato react-router: `location.search` es "" o empieza con exactamente
 * un "?". TanStack ya entrega `searchStr` con el "?" incluido (stringifySearch
 * lo prefija), así que anteponerlo otra vez producía "??status=overdue" y
 * `new URLSearchParams(search).get("status")` devolvía null.
 */
export function normalizeSearchStr(searchStr: string | undefined | null): string {
  if (!searchStr) return "";
  const trimmed = searchStr.replace(/^\?+/, "");
  return trimmed ? `?${trimmed}` : "";
}
