import { assertEquals } from "jsr:@std/assert@1";
import { hasValidRfcChecksum, validateRfcOrMessage } from "./rfcChecksum.ts";

Deno.test("RFC genérico se acepta", () => {
  assertEquals(hasValidRfcChecksum("XAXX010101000"), true);
  assertEquals(validateRfcOrMessage("XAXX010101000"), null);
});

Deno.test("RFC inventado con formato válido se rechaza", () => {
  assertEquals(hasValidRfcChecksum("AAAA010101AAA"), false);
  const msg = validateRfcOrMessage("AAAA010101AAA");
  assertEquals(typeof msg, "string");
});

Deno.test("RFC con formato inválido se rechaza", () => {
  assertEquals(validateRfcOrMessage("123") !== null, true);
  assertEquals(validateRfcOrMessage("") !== null, true);
});

Deno.test("dígito verificador correcto pasa", () => {
  // Persona moral de ejemplo con dígito verificador calculado por el algoritmo.
  const rfc = "XEXX010101000";
  assertEquals(hasValidRfcChecksum(rfc), true);
});
