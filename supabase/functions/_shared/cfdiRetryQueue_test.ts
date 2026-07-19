// Tests para _shared/cfdiRetryQueue helpers.
import {
  assertEquals,
  assertGreater,
  assertLess,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
  nextRetryAt,
} from "./cfdiRetryQueue.ts";
import type { SupabaseLike } from "./types.ts";

Deno.test("isTransientFacturapiError: 5xx / 429 / null → transient", () => {
  assertEquals(isTransientFacturapiError({ status: 500, message: "" }), true);
  assertEquals(isTransientFacturapiError({ status: 503, message: "" }), true);
  assertEquals(isTransientFacturapiError({ status: 429, message: "" }), true);
  assertEquals(isTransientFacturapiError({ status: null, message: "" }), true);
});

Deno.test("isTransientFacturapiError: 4xx negocio → NO transient", () => {
  assertEquals(isTransientFacturapiError({ status: 400, message: "" }), false);
  assertEquals(isTransientFacturapiError({ status: 401, message: "" }), false);
  assertEquals(isTransientFacturapiError({ status: 422, message: "" }), false);
});

Deno.test("nextRetryAt: backoff exponencial con techo 60min", () => {
  const now = Date.now();
  const t1 = nextRetryAt(0).getTime() - now;
  const t2 = nextRetryAt(1).getTime() - now;
  const t3 = nextRetryAt(3).getTime() - now;
  const tmax = nextRetryAt(20).getTime() - now;
  // 1min, 2min, 8min con tolerancia de ejecución
  assertGreater(t1, 55_000);
  assertLess(t1, 65_000);
  assertGreater(t2, 115_000);
  assertGreater(t3, 475_000);
  // Techo 60min ± 1s
  assertGreater(tmax, 59 * 60_000);
  assertLess(tmax, 61 * 60_000);
});

Deno.test("enqueueCfdiRetry: inserta con payload y devuelve id", async () => {
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    from(_t: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select(_c: string) {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: "queue-1" },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;

  const res = await enqueueCfdiRetry(admin, {
    operation: "stamp",
    invoiceId: "11111111-1111-1111-1111-111111111111",
    payload: { foo: "bar" },
    errorMessage: "boom",
  });
  assertEquals(res.id, "queue-1");
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].operation, "stamp");
  assertEquals(inserted[0].status, "pending");
  assertEquals(inserted[0].attempts, 0);
  assertEquals(inserted[0].last_error, "boom");
});

Deno.test("enqueueCfdiRetry: fallo de insert no rompe (devuelve id null)", async () => {
  const admin = {
    from(_t: string) {
      return {
        insert(_r: Record<string, unknown>) {
          return {
            select(_c: string) {
              return {
                single() {
                  return Promise.resolve({
                    data: null,
                    error: { message: "db down" },
                  });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;

  const res = await enqueueCfdiRetry(admin, {
    operation: "cancel",
    invoiceId: "22222222-2222-2222-2222-222222222222",
    payload: {},
  });
  assertEquals(res.id, null);
});
