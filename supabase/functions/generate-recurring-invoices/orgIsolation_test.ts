// Fase 1 multiempresa: aislamiento por organización en el generador de
// facturas recurrentes.
//  - Dos empresas con el mismo cliente y el mismo período NO deben agruparse
//    en una sola factura (la clave de agrupación de executePlan incluye
//    organizationId).
//  - El camino manual (usuario autenticado) siempre resuelve la organización
//    en el servidor (resolveCallerOrganization) y NUNCA acepta una
//    organización arbitraria del payload/cron.
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { resolveCallerOrganization } from "../_shared/orgContext.ts";

// Réplica de la clave de agrupación usada por executePlan en index.ts:
// `${organizationId}|${customerId}|${startStr}|${endStr}|${currency}|${tipoCambio}`.
function groupKey(item: {
  organizationId: string;
  customerId: string;
  startStr: string;
  endStr: string;
  currency: string;
  tipoCambio: number;
}): string {
  return `${item.organizationId}|${item.customerId}|${item.startStr}|${item.endStr}|${item.currency}|${item.tipoCambio}`;
}

Deno.test("multiempresa: mismo cliente y mismo período en dos empresas NO se agrupan", () => {
  const shared = {
    customerId: "cust-1",
    startStr: "2026-01-01",
    endStr: "2026-01-31",
    currency: "MXN",
    tipoCambio: 1,
  };
  const itemOrgA = { organizationId: "org-A", ...shared };
  const itemOrgB = { organizationId: "org-B", ...shared };

  const keyA = groupKey(itemOrgA);
  const keyB = groupKey(itemOrgB);

  assertNotEquals(keyA, keyB);

  const groups = new Map<string, unknown[]>();
  for (const item of [itemOrgA, itemOrgB]) {
    const key = groupKey(item);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  // Dos grupos distintos, uno por empresa — nunca una sola factura mezclando
  // reservas de dos organizaciones distintas.
  assertEquals(groups.size, 2);
  for (const arr of groups.values()) {
    assertEquals(arr.length, 1);
  }
});

Deno.test("multiempresa: un solo cliente y un solo período dentro de la misma empresa SÍ se agrupan", () => {
  const shared = {
    organizationId: "org-A",
    customerId: "cust-1",
    startStr: "2026-01-01",
    endStr: "2026-01-31",
    currency: "MXN",
    tipoCambio: 1,
  };
  const groups = new Map<string, unknown[]>();
  for (const item of [shared, shared]) {
    const key = groupKey(item);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  assertEquals(groups.size, 1);
  assertEquals([...groups.values()][0].length, 2);
});

Deno.test("multiempresa: resolveCallerOrganization deriva la organización de la membresía, no del payload", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: {
        data: [{ organization_id: "org-server-side", member_type: "internal" }],
        error: null,
      },
    },
  });

  // Aunque un payload intentara enviar `organizationId: "org-attacker"`, el
  // camino manual sólo usa lo devuelto por resolveCallerOrganization, que
  // ignora completamente el body de la petición.
  const result = await resolveCallerOrganization(mock.client, "user-1");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.organizationId, "org-server-side");
    assertNotEquals(result.organizationId, "org-attacker");
  }
});

Deno.test("multiempresa: sin membresía interna, resolveCallerOrganization falla cerrado (fail-closed)", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: { data: [], error: null },
    },
  });
  const result = await resolveCallerOrganization(mock.client, "user-2");
  assertEquals(result.ok, false);
});
