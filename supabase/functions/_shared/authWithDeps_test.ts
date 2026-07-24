// TESTS-ARQ2 v2 · DIFF 16: `authenticateWithDeps` centraliza la validación
// de JWT + rol para 6 edge functions. Este test blinda las ramas de
// autorización sin depender de un Supabase real.
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authenticateWithDeps,
  type CallerLike,
} from "./authWithDeps.ts";
import { buildSupabaseMock } from "./test/supabaseClientMock.ts";
import type { SupabaseLike } from "./types.ts";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/fn", { method: "POST", headers });
}

function makeDeps(opts: {
  claims?: Record<string, unknown> | null;
  claimsError?: unknown;
  rolesData?: Array<{ role: string }> | null;
  rolesError?: unknown;
}): {
  createCallerClient: (h: string) => CallerLike;
  createServiceClient: () => SupabaseLike;
} {
  const service = buildSupabaseMock({
    selects: {
      user_roles: { data: opts.rolesData ?? [], error: opts.rolesError ?? null },
    },
  }).client;
  const caller: CallerLike = {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: opts.claims === undefined
            ? null
            : { claims: opts.claims ?? undefined },
          error: opts.claimsError ?? null,
        }),
    },
  };
  return {
    createCallerClient: () => caller,
    createServiceClient: () => service,
  };
}

Deno.test("authWithDeps: sin Authorization → 401", async () => {
  const res = await authenticateWithDeps({
    req: req(),
    ...makeDeps({}),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 401);
});

Deno.test("authWithDeps: Authorization sin 'Bearer ' → 401", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Basic abc" }),
    ...makeDeps({}),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 401);
});

Deno.test("authWithDeps: getClaims falla → 401", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer t" }),
    ...makeDeps({ claimsError: new Error("boom") }),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 401);
});

Deno.test("authWithDeps: service_role JWT bypassa lookup de rol", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer service-token" }),
    ...makeDeps({ claims: { role: "service_role", sub: "svc" } }),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, true);
  if (res.ok) assertEquals(res.isServiceRole, true);
});

Deno.test("authWithDeps: usuario con rol permitido → ok", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer u" }),
    ...makeDeps({
      claims: { role: "authenticated", sub: "u-1" },
      rolesData: [{ role: "admin" }],
    }),
    allowedRoles: ["admin", "administrativo"],
  });
  assertStrictEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.userId, "u-1");
    assertEquals(res.isServiceRole, false);
  }
});

Deno.test("authWithDeps: usuario sin rol permitido → 403", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer u" }),
    ...makeDeps({
      claims: { role: "authenticated", sub: "u-2" },
      rolesData: [{ role: "ventas" }],
    }),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 403);
});

Deno.test("authWithDeps: lookup de roles falla → 500 (no expone error interno)", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer u" }),
    ...makeDeps({
      claims: { role: "authenticated", sub: "u-3" },
      rolesError: { message: "db down" },
    }),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 500);
    assertEquals(res.message, "Authorization check failed");
  }
});

Deno.test("authWithDeps: sub vacío en claims no-service_role → 401", async () => {
  const res = await authenticateWithDeps({
    req: req({ Authorization: "Bearer u" }),
    ...makeDeps({ claims: { role: "authenticated" } }),
    allowedRoles: ["admin"],
  });
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 401);
});
