import { NAV_GROUPS } from "./navConfig";

/**
 * Resaltado del sidebar: sólo la ruta MÁS ESPECÍFICA que coincida.
 *
 * Antes se usaba `pathname.startsWith(item.url)`, así que en
 * `/invoices/reconciliation` se pintaban activos dos ítems a la vez
 * ("Facturas" y "Conciliación de Pagos"). Ahora se compara por frontera de
 * segmento y, entre todas las coincidencias del menú, gana la URL más larga.
 */
const ALL_NAV_URLS: readonly string[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.url));

function matchesPrefix(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function isNavItemActive(
  pathname: string,
  url: string,
  urls: readonly string[] = ALL_NAV_URLS,
): boolean {
  if (!matchesPrefix(pathname, url)) return false;
  // Si otro ítem del menú coincide y es más específico, ese es el activo.
  return !urls.some((other) => other !== url && other.length > url.length && matchesPrefix(pathname, other));
}
