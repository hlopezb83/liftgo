// Multiempresa · generate-manual: consecutivo e insert POR ORGANIZACIÓN,
// más el bloqueo fail-closed de identidades sin membresía interna.
// Sin red ni base real: cliente inyectado.
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { insertManual, nextManualVersion } from "./manual.ts";
import {
  ORG_LOOKUP_UNAVAILABLE,
  ORG_MISSING_MEMBERSHIP,
  resolveCallerOrganization,
} from "../_shared/orgContext.ts";

interface ManualRow {
  organization_id: string;
  version: string;
}

/** Cliente falso: tabla `user_manual` en memoria, filtrada por organización. */
function makeManualClient(rows: ManualRow[]) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table !== "user_manual") throw new Error(`tabla inesperada ${table}`);
      return {
        select(_cols?: string) {
          let org: string | null = null;
          const q = {
            eq(col: string, val: string) {
              if (col === "organization_id") org = val;
              return q;
            },
            order() {
              return q;
            },
            limit() {
              return q;
            },
            maybeSingle() {
              const scoped = rows.filter((r) => r.organization_id === org);
              const last = scoped[scoped.length - 1] ?? null;
              return Promise.resolve({ data: last, error: null });
            },
          };
          return q;
        },
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          rows.push(row as unknown as ManualRow);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: row, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, inserted };
}

function membershipClient(
  result: { data?: unknown[] | null; error?: unknown },
) {
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

Deno.test("admin A: primera versión de su empresa es 1.0 e inserta con su organization_id", async () => {
  const { client, inserted } = makeManualClient([]);
  const saved = await insertManual(client, "org-a", [{ title: "t" }]);
  assertEquals(saved.ok, true);
  assertEquals(saved.version, "1.0");
  assertEquals(inserted[0].organization_id, "org-a");
});

Deno.test("el manual de B no altera el consecutivo de A", async () => {
  const { client } = makeManualClient([
    { organization_id: "org-a", version: "2.0" },
    { organization_id: "org-b", version: "9.0" },
  ]);
  const a = await nextManualVersion(client, "org-a");
  assertEquals(a.ok && a.version, "3.0");
});

Deno.test("admin B usa su propio consecutivo, independiente de A", async () => {
  const { client, inserted } = makeManualClient([
    { organization_id: "org-a", version: "7.0" },
  ]);
  const b = await insertManual(client, "org-b", [{ title: "t" }]);
  assertEquals(b.version, "1.0");
  assertEquals(inserted[0].organization_id, "org-b");

  const a = await insertManual(client, "org-a", [{ title: "t" }]);
  assertEquals(a.version, "8.0");
});

Deno.test("portal con rol admin residual: sin membresía interna queda bloqueado (403)", async () => {
  const res = await resolveCallerOrganization(
    membershipClient({ data: [], error: null }),
    "portal-user",
  );
  assertEquals(res.ok, false);
  if (res.ok) throw new Error("debía fallar");
  assertEquals(res.status, 403);
  assertStringIncludes(res.message, ORG_MISSING_MEMBERSHIP.slice(0, 20));
});

Deno.test("error de lookup de membresía: fail-closed 503", async () => {
  const res = await resolveCallerOrganization(
    membershipClient({ data: null, error: { message: "db down" } }),
    "u1",
  );
  if (res.ok) throw new Error("debía fallar");
  assertEquals(res.status, 503);
  assertEquals(res.message, ORG_LOOKUP_UNAVAILABLE);
});

Deno.test("membresía interna ambigua (>1): rechazo 409", async () => {
  const res = await resolveCallerOrganization(
    membershipClient({
      data: [{ organization_id: "org-a" }, { organization_id: "org-b" }],
      error: null,
    }),
    "u1",
  );
  if (res.ok) throw new Error("debía fallar");
  assertEquals(res.status, 409);
});
