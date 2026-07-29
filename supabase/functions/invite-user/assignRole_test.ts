import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assignRoleToUser } from "./assignRole.ts";

function createMockAdminClient(scenario: {
  upsertError?: { message: string; code: string } | null;
}): {
  from: (table: string) => {
    upsert: (
      _payload: unknown,
      options: { onConflict: string },
    ) => Promise<{ error: { message: string; code: string } | null }>;
  };
  captured: { table?: string; onConflict?: string };
} {
  const captured: { table?: string; onConflict?: string } = {};
  return {
    from: (table: string) => {
      captured.table = table;
      return {
        upsert: (_payload: unknown, options: { onConflict: string }) => {
          captured.onConflict = options.onConflict;
          return Promise.resolve({ error: scenario.upsertError ?? null });
        },
      };
    },
    captured,
  };
}

Deno.test("assignRoleToUser: upsert uses user_id conflict target (DB2-01)", async () => {
  const mock = createMockAdminClient({ upsertError: null });
  const result = await assignRoleToUser(
    mock as unknown as Parameters<typeof assignRoleToUser>[0],
    "00000000-0000-0000-0000-000000000001",
    "admin",
  );

  assertEquals(result.ok, true);
  assertEquals(mock.captured.table, "user_roles");
  assertEquals(mock.captured.onConflict, "user_id");
});

Deno.test("assignRoleToUser: returns structured error when upsert fails", async () => {
  const mock = createMockAdminClient({
    upsertError: { message: "duplicate key", code: "23505" },
  });
  const result = await assignRoleToUser(
    mock as unknown as Parameters<typeof assignRoleToUser>[0],
    "00000000-0000-0000-0000-000000000002",
    "ventas",
  );

  assertEquals(result.ok, false);
  assertEquals(
    (result as { message: string }).message,
    "No se pudo asignar el rol al usuario invitado. Reintenta o contacta a soporte.",
  );
});
