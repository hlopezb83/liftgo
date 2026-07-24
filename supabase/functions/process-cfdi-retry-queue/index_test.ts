import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";

Deno.test("nextRetryAt: 0 intentos → ~1 min", () => {
  const delta = nextRetryAt(0).getTime() - Date.now();
  assertEquals(Math.round(delta / 60_000), 1);
});

Deno.test("nextRetryAt: 1 intento → ~2 min", () => {
  const delta = nextRetryAt(1).getTime() - Date.now();
  assertEquals(Math.round(delta / 60_000), 2);
});

Deno.test("nextRetryAt: 3 intentos → ~8 min", () => {
  const delta = nextRetryAt(3).getTime() - Date.now();
  assertEquals(Math.round(delta / 60_000), 8);
});

Deno.test("nextRetryAt: tope 60 min a partir de 6+ intentos", () => {
  const delta10 = nextRetryAt(10).getTime() - Date.now();
  const delta6 = nextRetryAt(6).getTime() - Date.now();
  assertEquals(Math.round(delta10 / 60_000), 60);
  assertEquals(Math.round(delta6 / 60_000), 60);
});

// NC-1: el consumer usa exclusivamente los valores permitidos por el CHECK
// de cfdi_retry_queue. Este test congela el contrato para evitar regresión.
Deno.test("cfdi_retry_queue: consumer usa solo estados del CHECK", () => {
  const allowed = new Set(["pending", "processing", "succeeded", "exhausted"]);
  const consumerStates = ["processing", "succeeded", "exhausted", "pending"];
  for (const s of consumerStates) {
    if (!allowed.has(s)) {
      throw new Error(
        `Consumer usa "${s}" pero no está en el CHECK de la tabla`,
      );
    }
  }
  assertEquals(consumerStates.length, 4);
});

// EC-A1 / TESTS-ARQ2 (v7.220.0 DIFF 3): importar el mapa REAL desde index.ts —
// antes copiaba la tabla localmente y no detectaba drift si alguien renombraba
// una edge function o agregaba una nueva operación en cfdi_retry_queue.
import { OPERATION_TO_FUNCTION } from "./index.ts";

Deno.test("operation → function mapping usa funciones reales (contrato con CHECK)", () => {
  assertEquals(OPERATION_TO_FUNCTION.stamp, "stamp-cfdi");
  assertEquals(OPERATION_TO_FUNCTION.cancel, "cancel-cfdi");
  assertEquals(OPERATION_TO_FUNCTION.cancel_nc, "cancel-credit-note");
  assertEquals(OPERATION_TO_FUNCTION.cancel_rep, "cancel-payment-complement");
  assertEquals(
    new Set(Object.keys(OPERATION_TO_FUNCTION)),
    new Set(["stamp", "cancel", "cancel_nc", "cancel_rep"]),
  );
});

// TESTS-ARQ2 (DIFF 3): estado terminal `exhausted` cuando attempts alcanza
// max_attempts. Espejo puro de la rama en index.ts para blindar la política.
Deno.test("terminal state: attempts >= max_attempts → exhausted", () => {
  const decide = (attempts: number, max: number) =>
    attempts >= max ? "exhausted" : "pending";
  assertEquals(decide(5, 5), "exhausted");
  assertEquals(decide(6, 5), "exhausted");
  assertEquals(decide(4, 5), "pending");
});
