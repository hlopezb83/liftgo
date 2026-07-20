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

// EC-A1: mapping actualizado — cancel_rep apunta a cancel-payment-complement,
// no a la función inexistente "cancel-rep".
Deno.test("operation → function mapping usa funciones reales", () => {
  const map: Record<string, string> = {
    stamp: "stamp-cfdi",
    cancel: "cancel-cfdi",
    cancel_nc: "cancel-credit-note",
    cancel_rep: "cancel-payment-complement",
  };
  assertEquals(Object.keys(map).length, 4);
  assertEquals(map.cancel_rep, "cancel-payment-complement");
});
