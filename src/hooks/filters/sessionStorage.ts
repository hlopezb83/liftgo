// Persistencia por pathname en window.sessionStorage. Extraído de useTableFilters.

export function readSessionParams(pathname: string): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.sessionStorage.getItem(`list-filters:${pathname}`);
  return new URLSearchParams(raw ?? "");
}

export function writeSessionParams(pathname: string, params: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const key = `list-filters:${pathname}`;
  const qs = params.toString();
  if (qs) window.sessionStorage.setItem(key, qs);
  else window.sessionStorage.removeItem(key);
}
