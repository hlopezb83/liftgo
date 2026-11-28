/**
 * TS-02: contrato único de serialización de query strings.
 *
 * El ERP siempre trabaja con strings estilo `URLSearchParams` (`?new=1`,
 * `?from_prospect=true`, `?q=123`). El serializador JSON por omisión de
 * TanStack Router escribía `?new=%221%22` (comillas alrededor del valor),
 * rompiendo lecturas vía `URLSearchParams`.
 *
 * Estas dos funciones se registran en el router de la app (`src/router.tsx`)
 * y en el router de pruebas (`src/test/router.tsx`) para que lectura y
 * escritura compartan exactamente el mismo contrato.
 */

export function parseSearch(searchStr: string): Record<string, string> {
  const trimmed = (searchStr ?? "").replace(/^\?+/, "");
  if (!trimmed) return {};
  return Object.fromEntries(new URLSearchParams(trimmed));
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}
