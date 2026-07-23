/**
 * R-arq DIFF 5: la allowlist/blocklist del persister debe apuntar a roots
 * reales de queryKey. Si alguien renombra un factory, este test falla y evita
 * volver a la regresión en la que la cache no se persistía por un typo.
 */
import { describe, expect, it } from "vitest";

import { PERSIST_ALLOWLIST, PERSIST_BLOCKLIST, shouldPersistQuery } from "../persister";

// Roots que realmente existen en la app (extraídos de los factories).
// Mantener esta lista sincronizada con `createEntityKeys(...)` /
// `defineEntityQueries("...")` en `src/features/*/lib/queryKeys.ts`.
const KNOWN_ROOTS = new Set<string>([
  // Dashboard
  "dashboard-stats",
  "dashboard-mrr-detail",
  "dashboard-financial-kpis",
  "dashboard-activity-feed",
  // Catálogos
  "equipment_models",
  "drivers",
  "mechanics",
  "forklifts",
  "parts_inventory",
  "contracts",
  "insurance-alerts",
  // Config
  "changelog",
  "public_branding",
  "cash_flow_settings",
  "cash_flow_projection",
  "income_statement",
  "user-manual",
  "user-manual-versions",
  // Sensibles (esperamos que estén en blocklist)
  "user_role",
  "user_roles",
  "users",
  "role_permissions",
  "billing_secrets_status",
  "portal",
  "audit",
  "customers",
  "suppliers",
  "prospects",
  "feedback_reports",
]);

describe("query persister allowlist/blocklist", () => {
  it("todos los items del allowlist corresponden a factories reales", () => {
    for (const root of PERSIST_ALLOWLIST) {
      expect(KNOWN_ROOTS.has(root), `allowlist root sin factory real: ${root}`).toBe(true);
    }
  });

  it("no hay solapamiento entre allowlist y blocklist", () => {
    const overlap = PERSIST_ALLOWLIST.filter((r) => PERSIST_BLOCKLIST.includes(r));
    expect(overlap, `overlap: ${overlap.join(", ")}`).toEqual([]);
  });

  it("shouldPersistQuery: allowlist → true, blocklist → false, resto → false", () => {
    expect(shouldPersistQuery({ queryKey: ["dashboard-stats"] } as never)).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["forklifts"] } as never)).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["user_role", "abc"] } as never)).toBe(false);
    expect(shouldPersistQuery({ queryKey: ["customers"] } as never)).toBe(false);
    expect(shouldPersistQuery({ queryKey: ["random-unknown-root"] } as never)).toBe(false);
    expect(shouldPersistQuery({ queryKey: [123] } as never)).toBe(false);
  });
});
