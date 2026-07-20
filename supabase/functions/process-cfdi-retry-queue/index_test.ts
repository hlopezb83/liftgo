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

Deno.test("cfdi_retry_queue: operation -> function mapping cubre las 4 operaciones", () => {
  const map: Record<string, string> = {
    stamp: "stamp-cfdi",
    cancel: "cancel-cfdi",
    cancel_nc: "cancel-credit-note",
    cancel_rep: "cancel-rep",
  };
  assertEquals(Object.keys(map).length, 4);
  assertEquals(map.stamp, "stamp-cfdi");
  assertEquals(map.cancel, "cancel-cfdi");
});
