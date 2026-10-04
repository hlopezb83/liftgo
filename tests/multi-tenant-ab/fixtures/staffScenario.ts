import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyApiSession } from "../../e2e/fixtures/apiAuth";
import type { SeedIds } from "../../e2e/fixtures/seed";
import { readAbContext } from "./abSeed";
import { createLocalAdminClient, createLocalUserClient } from "./localBackend";

type Scenario = {
  client: SupabaseClient; ids: SeedIds; organizationId: string;
  track: (table: "quotes" | "bookings" | "invoices", id: string) => void;
};

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
    const created: Array<{ table: "quotes" | "bookings" | "invoices"; id: string }> = [];
    // El escenario heredado también crea una OT abierta. Cerrarla como
    // cancelada deja la unidad disponible por la reconciliación oficial;
    // estos recorridos prueban renta/cobro, sin una reparación pendiente.
    const cancelled = await client.from("maintenance_logs").update({ work_status: "cancelled" })
      .eq("id", ids.maintenance_log_id).select("work_status").single();
    expect(cancelled.error).toBeNull();
    expect(cancelled.data?.work_status).toBe("cancelled");
    await applyApiSession(page, ctx.A.internal.email, ctx.A.internal.password);
    try {
      await use({ client, ids, organizationId: ctx.A.organizationId,
        track: (table, id) => { created.push({ table, id }); } });
    } finally {
      // Sólo la limpieza usa servicio, limitado por ID y empresa. Las filas
      // creadas en los pasos se ejercitan con actor ordinario y sin bypass E2E.
      const cleanupClient = createLocalAdminClient("workflow cleanup");
      for (const row of created) {
        const tagged = await cleanupClient.from(row.table).update({ is_e2e: true, e2e_scope: scope })
          .eq("id", row.id).eq("organization_id", ctx.A.organizationId).select("id").single();
        expect(tagged.error).toBeNull();
        expect(tagged.data?.id).toBe(row.id);
      }
      const bookings = await client.from("bookings").select("id").eq("e2e_scope", scope);
      expect(bookings.error).toBeNull();
      const bookingIds = (bookings.data ?? []).map((row) => row.id as string);
      if (bookingIds.length) {
        for (const table of ["return_inspections", "deliveries"]) {
          const removed = await cleanupClient.from(table).delete().in("booking_id", bookingIds)
            .eq("organization_id", ctx.A.organizationId);
          expect(removed.error, "Limpieza de " + table).toBeNull();
        }
      }
      const cleanup = await client.rpc("e2e_teardown", { p_scope: scope });
      expect(cleanup.error, "La limpieza por scope debe completarse").toBeNull();
    }
  },
});

export { expect } from "@playwright/test";
