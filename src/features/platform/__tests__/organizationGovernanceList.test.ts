import { describe, expect, it } from "vitest";
import type { PlatformOrganizationRow } from "@/lib/platformAdmin.types";
import type { OrganizationGovernanceSummary } from "@/lib/platformOrganizationGovernance.types";
import { filterOrganizationRegistry } from "../lib/organizationGovernanceList";
const companies: PlatformOrganizationRow[] = [
  { id: "A", name: "ELOGISTIX SHIPPING", slug: "elogistix", razon_social: null, is_active: true, created_at: "now", internal_members: 1, portal_accounts: 0, customers: 2 },
  { id: "B", name: "LiftGo Pruebas", slug: "liftgo-sur", razon_social: "Industrial del Sur", is_active: false, created_at: "now", internal_members: 2, portal_accounts: 1, customers: 5 },
];
const governance: OrganizationGovernanceSummary[] = [
  { organizationId: "A", classification: "test", city: "Monterrey", territory: "Nuevo León", revision: "1", updatedAt: null },
  { organizationId: "B", classification: "live", city: "Mérida", territory: "Sureste", revision: "1", updatedAt: null },
];
const all = { search: "", status: "", classification: "" as const };
describe("registro de empresas por datos explícitos", () => {
  it("incluye reales, pruebas y suspendidas en el registro completo", () => {
    expect(filterOrganizationRegistry(companies, governance, all).map((row) => row.id)).toEqual(["A", "B"]);
  });
  it("filtra por clasificación guardada, nunca por el nombre de la empresa", () => {
    expect(filterOrganizationRegistry(companies, governance, { ...all, classification: "test" }).map((row) => row.id)).toEqual(["A"]);
    expect(filterOrganizationRegistry(companies, governance, { ...all, classification: "live", status: "inactive" }).map((row) => row.id)).toEqual(["B"]);
  });
  it("busca ciudad/territorio sin distinguir acentos ni mayúsculas", () => {
    expect(filterOrganizationRegistry(companies, governance, { ...all, search: " MERIDA " }).map((row) => row.id)).toEqual(["B"]);
    expect(filterOrganizationRegistry(companies, governance, { ...all, search: "nuevo leon" }).map((row) => row.id)).toEqual(["A"]);
  });
  it("no inventa una clasificación si aún no pudo consultar la ficha", () => {
    expect(filterOrganizationRegistry(companies, [], all)[0].governance).toBeUndefined();
    expect(filterOrganizationRegistry(companies, [], { ...all, classification: "unclassified" })).toEqual([]);
  });
});
