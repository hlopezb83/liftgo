import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createRequestDiagnostics,
  type VerifiedEdgeIdentity,
} from "./edgeDiagnostics.ts";

Deno.test("diagnóstico: resolver empresa conserva actor/rol y un nuevo actor limpia empresa", () => {
  const seen: VerifiedEdgeIdentity[] = [];
  const diagnostics = createRequestDiagnostics({
    identify: (identity) => seen.push(identity),
    capture: () => {},
  });
  diagnostics.authenticated({ userId: "actor-a", role: "admin" });
  diagnostics.organization("org-a");
  diagnostics.authenticated({ userId: "actor-b", role: "ventas" });
  assertEquals(seen, [
    { userId: "actor-a", role: "admin" },
    { userId: "actor-a", role: "admin", organizationId: "org-a" },
    { userId: "actor-b", role: "ventas" },
  ]);
});

Deno.test("diagnóstico: callback ajeno no muta la identidad guardada", () => {
  const seen: VerifiedEdgeIdentity[] = [];
  const diagnostics = createRequestDiagnostics({
    identify(identity) {
      seen.push({ ...identity });
      identity.userId = "tampered";
    },
    capture: () => {},
  });
  diagnostics.authenticated({ userId: "actor-a", role: "admin" });
  diagnostics.organization("org-a");
  assertEquals(seen[1], {
    userId: "actor-a",
    role: "admin",
    organizationId: "org-a",
  });
});

Deno.test("diagnóstico: instancias concurrentes A/B no comparten identidad", async () => {
  const seen: VerifiedEdgeIdentity[] = [];
  const port = {
    identify: (identity: VerifiedEdgeIdentity) => seen.push(identity),
    capture: () => {},
  };
  const a = createRequestDiagnostics(port);
  const b = createRequestDiagnostics(port);
  await Promise.all([
    (async () => {
      a.authenticated({ userId: "actor-a" });
      await Promise.resolve();
      a.organization("org-a");
    })(),
    (async () => {
      b.authenticated({ userId: "actor-b" });
      await Promise.resolve();
      b.organization("org-b");
    })(),
  ]);
  assertEquals(
    seen.filter((identity) => identity.organizationId).map((
      identity,
    ) => [identity.userId, identity.organizationId]),
    [["actor-a", "org-a"], ["actor-b", "org-b"]],
  );
});

Deno.test("diagnóstico: fallo del puerto se contiene; captura entrega el error original", () => {
  const failing = createRequestDiagnostics({
    identify: () => {
      throw new Error("observer");
    },
    capture: () => {
      throw new Error("observer");
    },
  });
  failing.authenticated({ userId: "actor-a" });
  failing.organization("org-a");
  failing.capture(new Error("original"), 500);
  const error = new TypeError("original");
  let seenError: unknown;
  let seenStatus: number | undefined;
  const good = createRequestDiagnostics({
    identify: () => {},
    capture: (seen, status) => {
      seenError = seen;
      seenStatus = status;
    },
  });
  good.capture(error, 500);
  assertStrictEquals(seenError, error);
  assertEquals(seenStatus, 500);
  createRequestDiagnostics().capture(error, 500);
});
