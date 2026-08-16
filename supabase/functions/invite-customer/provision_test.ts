import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
// deno-lint-ignore-file no-explicit-any
import { provisionCustomerAccess } from "./provision.ts";

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
}

function makeClient(errors: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(payload: unknown, options: unknown) {
          calls.push({ table, op: "upsert", payload, options });
          return Promise.resolve({ error: errors[`${table}.upsert`] ?? null });
        },
        update(payload: unknown) {
          calls.push({ table, op: "update", payload });
          return {
            eq() {
              return Promise.resolve({
                error: errors[`${table}.update`] ?? null,
              });
            },
          };
        },
        insert() {
          calls.push({ table, op: "insert" });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as any;
  return { client, calls };
}

const params = { userId: "u1", customerId: "c1", fullName: "Cliente Demo" };

Deno.test("no usa INSERT plano: el trigger ya creó perfil y rol", async () => {
  const { client, calls } = makeClient();
  const res = await provisionCustomerAccess(client, params);
  assertEquals(res.ok, true);
  assertEquals(calls.some((c) => c.op === "insert"), false);
  assertEquals(calls[0], {
    table: "user_roles",
    op: "upsert",
    payload: { user_id: "u1", role: "customer" },
    options: { onConflict: "user_id" },
  });
  assertEquals(calls[1].table, "profiles");
  assertEquals(calls[2].table, "customers");
});

Deno.test("reporta el paso que falló", async () => {
  const { client } = makeClient({ "user_roles.upsert": { code: "23505" } });
  const res = await provisionCustomerAccess(client, params);
  assertEquals(res, { ok: false, step: "role" });
});

Deno.test("falla al ligar el cliente", async () => {
  const { client } = makeClient({ "customers.update": { code: "PGRST" } });
  const res = await provisionCustomerAccess(client, params);
  assertEquals(res, { ok: false, step: "link" });
});
