import { describe, it, expect } from "vitest";
import { translatePgError } from "@/lib/errors/pgErrorCatalog";

/**
 * Subtramo 6.1 — mientras la matriz de índices por empresa sigue pendiente,
 * un choque de unicidad global puede venir de un registro de otra empresa que
 * el usuario no puede ver. El mensaje debe ser seguro (sin revelar el otro
 * registro) y accionable.
 */
const SHARED_UNIQUE_CONSTRAINTS = [
  "forklifts_serial_number_unique",
  "forklifts_name_unique",
  "drivers_name_unique",
  "mechanics_name_unique",
  "parts_inventory_sku_unique",
  "suppliers_rfc_unique_idx",
];

describe("choques de unicidad global entre empresas", () => {
  it.each(SHARED_UNIQUE_CONSTRAINTS)("%s se traduce a un mensaje seguro y accionable", (name) => {
    const t = translatePgError({
      code: "23505",
      message: `duplicate key value violates unique constraint "${name}"`,
    });
    expect(t.matched).toBe(true);
    expect(t.message).toMatch(/ya está registrad/i);
    expect(t.message).toMatch(/administrador|distintivo|entre empresas/i);
    // No revela datos ni identificadores del registro en conflicto.
    expect(t.message).not.toMatch(/organization|uuid|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("modelos de equipo se explican como catálogo compartido", () => {
    const t = translatePgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "equipment_models_mfr_model_unique"',
    });
    expect(t.matched).toBe(true);
    expect(t.message).toMatch(/catálogo compartido/i);
  });
});
