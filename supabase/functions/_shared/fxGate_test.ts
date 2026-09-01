// R9-02: gate canónico de tipo de cambio previo al timbrado.
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertStampFxOrThrow,
  checkStampFx,
  effectiveStampExchange,
  isFxMissingForStamping,
} from "./fxGate.ts";

Deno.test("MXN siempre es válida, sin importar el TC guardado", () => {
  assertEquals(isFxMissingForStamping("MXN", null), false);
  assertEquals(isFxMissingForStamping("MXN", 0), false);
  assertEquals(isFxMissingForStamping(null, undefined), false);
  assertEquals(effectiveStampExchange("MXN", 17.5), 1);
});

Deno.test("USD sin TC (null) es faltante", () => {
  assertEquals(isFxMissingForStamping("USD", null), true);
});

Deno.test("USD con TC=0 es faltante", () => {
  assertEquals(isFxMissingForStamping("USD", 0), true);
});

Deno.test("USD con TC negativo es faltante", () => {
  assertEquals(isFxMissingForStamping("USD", -5), true);
});

Deno.test("USD con TC=1 es faltante (default no capturado)", () => {
  assertEquals(isFxMissingForStamping("USD", 1), true);
});

Deno.test("USD con TC=18 es válido", () => {
  assertEquals(isFxMissingForStamping("USD", 18), false);
  assertEquals(effectiveStampExchange("USD", 18), 18);
});

Deno.test("checkStampFx: mensaje en español claro cuando falta", () => {
  const r = checkStampFx("USD", null);
  assertEquals(r.ok, false);
  assertEquals(
    r.message?.includes(
      "La factura está en USD pero no tiene un tipo de cambio válido",
    ),
    true,
  );
});

Deno.test("checkStampFx: ok=true con exchange efectivo para moneda foránea válida", () => {
  const r = checkStampFx("usd", "18.5");
  assertEquals(r.ok, true);
  assertEquals(r.currency, "USD");
  assertEquals(r.exchange, 18.5);
});

Deno.test("assertStampFxOrThrow: lanza con mensaje claro si falta TC", () => {
  assertThrows(
    () => assertStampFxOrThrow("USD", 1),
    Error,
    "La factura está en USD",
  );
});

Deno.test("assertStampFxOrThrow: no lanza y regresa exchange correcto", () => {
  const r = assertStampFxOrThrow("MXN", null);
  assertEquals(r, { currency: "MXN", exchange: 1 });
});
