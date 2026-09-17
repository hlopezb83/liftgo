import { describe, it, expect } from "vitest";
import { translatePgError } from "@/lib/errors/pgErrorCatalog";

/**
 * Tramo 8 (migración 0029) — los catálogos operativos, el folio REP y el
 * catálogo de proveedores pasaron a ser únicos DENTRO de cada empresa.
 * El choque ahora siempre es con un registro propio y visible, así que el
 * mensaje debe invitar a buscarlo, no a pedir apoyo al administrador.
 */
const ORG_SCOPED_CONSTRAINTS = [
  "forklifts_org_name_unique",
  "forklifts_org_serial_number_unique",
  "mechanics_org_name_unique",
  "drivers_org_name_unique",
  "parts_inventory_org_sku_unique",
  "payments_org_rep_number_uidx",
  "suppliers_org_rfc_unique_idx",
  "prospects_org_stage_order_uniq",
];

describe("unicidad por empresa (0029)", () => {
  it.each(ORG_SCOPED_CONSTRAINTS)("%s tiene mensaje propio y seguro", (name) => {
    const t = translatePgError({
      code: "23505",
      message: `duplicate key value violates unique constraint "${name}"`,
    });
    expect(t.matched).toBe(true);
    expect(t.message.length).toBeGreaterThan(10);
    // No revela identificadores ni datos del registro en conflicto.
    expect(t.message).not.toMatch(/organization|uuid|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it.each([
    ["forklifts_org_name_unique", "forklifts_name_unique"],
    ["payments_org_rep_number_uidx", "payments_rep_number_uidx"],
    ["suppliers_org_rfc_unique_idx", "suppliers_rfc_unique_idx"],
  ])("%s no se confunde con el nombre global %s", (orgName, globalName) => {
    const orgMsg = translatePgError({
      code: "23505",
      message: `duplicate key value violates unique constraint "${orgName}"`,
    }).message;
    const globalMsg = translatePgError({
      code: "23505",
      message: `duplicate key value violates unique constraint "${globalName}"`,
    }).message;
    expect(orgMsg).not.toBe(globalMsg);
  });

  it("los nombres globales siguen traducidos para ambientes sin 0029", () => {
    const t = translatePgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "mechanics_name_unique"',
    });
    expect(t.matched).toBe(true);
  });
});
