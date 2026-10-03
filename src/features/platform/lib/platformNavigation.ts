export const PLATFORM_HOME = "/platform";
export const PLATFORM_LOGIN = "/platform/login";
export const ORGANIZATION_WORKSPACE = "/?workspace=organization";
const DESTINATIONS = [
  PLATFORM_HOME,
  "/platform/organizations",
  "/platform/catalogs",
  "/platform/catalogs/import",
  "/platform/audit",
  "/platform/operators",
  "/platform/security",
  "/platform/integrations",
  "/platform/fiscal-jobs",
  "/platform/monitoring",
  "/platform/support",
  "/platform/support?status=open",
  "/platform/fiscal-jobs?status=queued",
  "/platform/fiscal-jobs?status=exhausted",
  "/platform/organizations#pending-onboarding",
];
const COMPANY_DETAIL =
  /^\/platform\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function platformReturnDestination(search: string): string {
  const next = new URLSearchParams(search).get("next");
  return next && (DESTINATIONS.includes(next) || COMPANY_DETAIL.test(next))
    ? next
    : PLATFORM_HOME;
}

export function isPlatformPath(pathname: string): boolean {
  return pathname === PLATFORM_HOME || pathname.startsWith(`${PLATFORM_HOME}/`);
}

/** Destino de entrada; el parámetro de workspace no concede permisos. */
export function platformEntryDestination(
  pathname: string,
  search = "",
): string | null {
  if (pathname === "/settings/organizations") return "/platform/organizations";
  if (pathname === "/settings/catalogs") return "/platform/catalogs";
  if (
    pathname === "/" &&
    new URLSearchParams(search).get("workspace") !== "organization"
  ) {
    return PLATFORM_HOME;
  }
  return null;
}
