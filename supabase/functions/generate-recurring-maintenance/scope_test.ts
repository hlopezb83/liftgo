// Multiempresa · alcance de la corrida de pólizas:
// cron global vs. persona acotada a su empresa, y rechazo sin escribir
// cuando póliza y unidad no comparten organización. Sin red ni base real.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveMaintenanceScope } from "./scope.ts";
import {
  generateForPolicies,
  type MaintenanceClientLike,
  type MaintenancePolicyRow,
  policyOrganizationIssue,
} from "./logic.ts";

function membershipClient(result: { data?: unknown[]; error?: unknown }) {
  return {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        limit() {
          return Promise.resolve(result);
        },
      };
      return q;
    },
  };
}

function policy(over: Partial<MaintenancePolicyRow> = {}): MaintenancePolicyRow {
  return {
    id: "p1",
    organization_id: "org-a",
    forklift_id: "f1",
    service_type: "preventivo",
    description: null,
    provider_name: "Proveedor",
    monthly_cost: 1000,
    last_generated_month: "2026-08",
    forklifts: { name: "MC-1", status: "rented", organization_id: "org-a" },
    ...over,
  };
}

/** Cliente que registra los `maintenance_logs` insertados. */
function makeClient() {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    rpc() {
      return Promise.resolve({ data: true, error: null });
    },
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  const p = Promise.resolve({ error: null });
                  return Object.assign(p, {
                    select: () => Promise.resolve({ data: [], error: null }),
                  });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as MaintenanceClientLike;
  return { client, inserts };
}

Deno.test("cron válido: alcance global (sin filtro de organización)", async () => {
  const scope = await resolveMaintenanceScope({
    isCron: true,
    role: null,
    userId: "",
    admin: membershipClient({ data: [], error: null }),
  });
  assertEquals(scope, { ok: true, organizationId: null, global: true });
});

Deno.test("service_role sin cron: también alcance global", async () => {
  const scope = await resolveMaintenanceScope({
    isCron: false,
    role: "service_role",
    userId: "",
    admin: membershipClient({ data: [], error: null }),
  });
  assertEquals(scope.ok && scope.global, true);
});

Deno.test("admin A autenticado: alcance acotado a su organización", async () => {
  const scope = await resolveMaintenanceScope({
    isCron: false,
    role: "admin",
    userId: "u-a",
    admin: membershipClient({ data: [{ organization_id: "org-a" }] }),
  });
  assertEquals(scope.ok && scope.organizationId, "org-a");
});

Deno.test("admin B autenticado: alcance acotado a la suya, nunca a A", async () => {
  const scope = await resolveMaintenanceScope({
    isCron: false,
    role: "administrativo",
    userId: "u-b",
    admin: membershipClient({ data: [{ organization_id: "org-b" }] }),
  });
  assertEquals(scope.ok && scope.organizationId, "org-b");
});

Deno.test("membresía ausente o con error: falla cerrado", async () => {
  const sinMembresia = await resolveMaintenanceScope({
    isCron: false,
    role: "admin",
    userId: "u-x",
    admin: membershipClient({ data: [] }),
  });
  assertEquals(sinMembresia.ok, false);

  const conError = await resolveMaintenanceScope({
    isCron: false,
    role: "admin",
    userId: "u-x",
    admin: membershipClient({ data: null, error: { message: "db down" } }),
  });
  if (conError.ok) throw new Error("debía fallar");
  assertEquals(conError.status, 503);

  const ambigua = await resolveMaintenanceScope({
    isCron: false,
    role: "admin",
    userId: "u-x",
    admin: membershipClient({
      data: [{ organization_id: "org-a" }, { organization_id: "org-b" }],
    }),
  });
  assertEquals(ambigua.ok, false);
});

Deno.test("corrida humana de A: sólo procesa pólizas de A, nunca de B", async () => {
  const { client, inserts } = makeClient();
  const res = await generateForPolicies(
    client,
    [
      policy({ id: "pa" }),
      policy({
        id: "pb",
        organization_id: "org-b",
        forklifts: { name: "MC-B", status: "rented", organization_id: "org-b" },
      }),
    ],
    "2026-09",
    "org-a",
  );
  assertEquals(res.generated, 1);
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].organization_id, "org-a");
  assertEquals(inserts[0].policy_id, "pa");
});

Deno.test("corrida humana de B: sólo B", async () => {
  const { client, inserts } = makeClient();
  await generateForPolicies(
    client,
    [
      policy({ id: "pa" }),
      policy({
        id: "pb",
        organization_id: "org-b",
        forklifts: { name: "MC-B", status: "rented", organization_id: "org-b" },
      }),
    ],
    "2026-09",
    "org-b",
  );
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].organization_id, "org-b");
});

Deno.test("cron: procesa A y B propagando el organization_id de cada póliza", async () => {
  const { client, inserts } = makeClient();
  const res = await generateForPolicies(
    client,
    [
      policy({ id: "pa" }),
      policy({
        id: "pb",
        organization_id: "org-b",
        forklifts: { name: "MC-B", status: "rented", organization_id: "org-b" },
      }),
    ],
    "2026-09",
    null,
  );
  assertEquals(res.generated, 2);
  assertEquals(inserts.map((i) => i.organization_id), ["org-a", "org-b"]);
});

Deno.test("póliza y unidad de empresas distintas: se omite sin escribir", async () => {
  const { client, inserts } = makeClient();
  const res = await generateForPolicies(
    client,
    [
      policy({
        id: "mix",
        organization_id: "org-a",
        forklifts: { name: "MC-X", status: "rented", organization_id: "org-b" },
      }),
    ],
    "2026-09",
    null,
  );
  assertEquals(inserts.length, 0);
  assertEquals(res.generated, 0);
  assertEquals(res.skipped, 1);
});

Deno.test("póliza sin empresa: se omite sin escribir", () => {
  const issue = policyOrganizationIssue(
    policy({ organization_id: "" as unknown as string }),
    null,
  );
  assertEquals(typeof issue, "string");
});
