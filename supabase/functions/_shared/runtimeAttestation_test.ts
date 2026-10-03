import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inspectEdgeRuntime } from "./runtimeAttestation.ts";

const version = { deno: "2.8.3", v8: "test-v8", typescript: "test-ts" };

Deno.test("runtime: contextos concurrentes y siguiente scope anónimo aislados", async () => {
  const result = await inspectEdgeRuntime(version);
  assertEquals(result, {
    ...version,
    asyncLocalStorage: true,
    sentry11RuntimeMinimumMet: true,
  });
});

Deno.test("runtime: disponibilidad de ALS no convierte Deno antiguo en compatible", async () => {
  const result = await inspectEdgeRuntime({ ...version, deno: "2.1.4" });
  assertEquals(result.asyncLocalStorage, true);
  assertEquals(result.sentry11RuntimeMinimumMet, false);
});

Deno.test("runtime: contextos globales compartidos no pasan la comprobación", async () => {
  class GlobalContext {
    value: string | undefined;
    run<T>(value: string, callback: () => T): T {
      this.value = value;
      return callback();
    }
    getStore() {
      return this.value;
    }
    disable() {
      this.value = undefined;
    }
  }
  const result = await inspectEdgeRuntime(
    version,
    () => Promise.resolve({ AsyncLocalStorage: GlobalContext }),
  );
  assertEquals(result.asyncLocalStorage, false);
  assertEquals(result.sentry11RuntimeMinimumMet, false);
});

Deno.test("runtime: importación fallida conserva un resultado mínimo sin error crudo", async () => {
  const result = await inspectEdgeRuntime(
    version,
    () => Promise.reject(new Error("private-host-error")),
  );
  assertEquals(result, {
    ...version,
    asyncLocalStorage: false,
    sentry11RuntimeMinimumMet: false,
  });
});

Deno.test("runtime: versiones prerelease o ilegibles no acreditan el mínimo", async () => {
  for (const deno of ["2.8.2", "2.8.3-rc.1", "unknown"]) {
    assertEquals(
      (await inspectEdgeRuntime({ ...version, deno }))
        .sentry11RuntimeMinimumMet,
      false,
    );
  }
  for (const deno of ["2.8.4", "2.9.7", "3.0.0"]) {
    assertEquals(
      (await inspectEdgeRuntime({ ...version, deno }))
        .sentry11RuntimeMinimumMet,
      true,
    );
  }
});

Deno.test("runtime: usa la versión Deno declarada por Cloud, no la versión del Edge Runtime", async () => {
  for (
    const [deno, expected] of [
      ["supabase-edge-runtime-1.77.0 (compatible with Deno v2.1.4)", false],
      ["supabase-edge-runtime-1.80.0 (compatible with Deno v2.8.3)", true],
      ["supabase-edge-runtime-2.9.7 (compatible with Deno v2.1.4)", false],
    ] as const
  ) {
    assertEquals(
      (await inspectEdgeRuntime({ ...version, deno }))
        .sentry11RuntimeMinimumMet,
      expected,
    );
  }
});
