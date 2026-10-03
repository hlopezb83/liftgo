import type { PlatformOrganizationRow } from "@/lib/platformAdmin.types";
import type { OrganizationClassification, OrganizationGovernanceSummary } from "@/lib/platformOrganizationGovernance.types";

export type OrganizationWithGovernance = PlatformOrganizationRow & { governance?: OrganizationGovernanceSummary };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** El registro administrativo incluye todas las empresas; la clasificación nunca se infiere por su nombre. */
export function filterOrganizationRegistry(
  organizations: PlatformOrganizationRow[] | undefined, governance: OrganizationGovernanceSummary[] | undefined,
  filters: { search: string; status: string; classification: OrganizationClassification | "" },
): OrganizationWithGovernance[] {
  const byId = new Map((governance ?? []).map((item) => [item.organizationId, item]));
  const needle = normalize(filters.search.trim());
  return (organizations ?? []).map((row) => ({ ...row, governance: byId.get(row.id) })).filter((row) => {
    if (filters.status && row.is_active !== (filters.status === "active")) return false;
    if (filters.classification && row.governance?.classification !== filters.classification) return false;
    return normalize([row.name, row.razon_social, row.slug, row.governance?.city, row.governance?.territory].join(" ")).includes(needle);
  });
}
