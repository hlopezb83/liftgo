import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyApiSession } from "../../e2e/fixtures/apiAuth";
import type { SeedIds } from "../../e2e/fixtures/seed";
import { readAbContext } from "./abSeed";
import { createLocalUserClient } from "./localBackend";

type Scenario = { client: SupabaseClient; ids: SeedIds; organizationId: string };

/** Sólo siembra prerrequisitos. Las transiciones del caso ocurren en sus pasos. */
export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({ page }, use) => {
    const ctx = readAbContext();
    const client = await createLocalUserClient("workflow", ctx.A.internal.email, ctx.A.internal.password);
    const scope = "workflow-" + randomUUID();
    const seed = await client.rpc("e2e_seed_scenario", { p_scope: scope });
    expect(seed.error, "El fixture requerido no puede omitirse").toBeNull();
    expect(seed.data?.invoice_id).toBeTruthy();
    const ids = seed.data as SeedIds;
    await applyApiSession(page, ctx.A.internal.email, ctx.A.internal.password);
    try {
      await use({ client, ids, organizationId: ctx.A.organizationId });
    } finally {
      const bookings = await client.from("bookings").select("id").eq("e2e_scope", scope);
      expect(bookings.error).toBeNull();
      const bookingIds = (bookings.data ?? []).map((row) => row.id as string);
      if (bookingIds.length) {
        for (const table of ["return_inspections", "deliveries"]) {
          const removed = await client.from(table).delete().in("booking_id", bookingIds);
          expect(removed.error, "Limpieza de " + table).toBeNull();
        }
      }
      const cleanup = await client.rpc("e2e_teardown", { p_scope: scope });
      expect(cleanup.error, "La limpieza por scope debe completarse").toBeNull();
    }
  },
});

export { expect } from "@playwright/test";
