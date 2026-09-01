// R8-06: el receptor global (XAXX010101000) siempre timbra con el código puro
// "616", tanto en notas de crédito como en complementos de pago.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "./regimenFiscal.ts";

Deno.test("receptor global: etiqueta heredada se normaliza a 616 (NC)", () => {
  assertEquals(
    resolveReceptorRegimenFiscal(true, "616 - Sin obligaciones fiscales"),
    "616",
  );
});

Deno.test("receptor global: nulo/vacío también resuelve 616 (REP)", () => {
  assertEquals(resolveReceptorRegimenFiscal(true, null), "616");
  assertEquals(resolveReceptorRegimenFiscal(true, ""), "616");
  assertEquals(resolveReceptorRegimenFiscal(true, "601"), "616");
});

Deno.test("receptor no global: se conserva el valor recortado y la validación", () => {
  assertEquals(resolveReceptorRegimenFiscal(false, " 601 "), "601");
  assertEquals(
    isValidRegimenFiscalCode(resolveReceptorRegimenFiscal(false, " 601 ")),
    true,
  );

  const legacy = resolveReceptorRegimenFiscal(false, "601 - General de Ley");
  assertEquals(legacy, "601 - General de Ley");
  assertEquals(isValidRegimenFiscalCode(legacy), false);
  assertEquals(resolveReceptorRegimenFiscal(false, null), "");
});
