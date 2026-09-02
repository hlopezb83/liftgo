import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractNonRentalLines } from "./nonRentalLines.ts";

Deno.test("FIX-6: descarta renta y venta, conserva extras", () => {
  const lines = extractNonRentalLines([
    { description: "Montacargas A — Renta mensual (ene)", quantity: 1, unit_price: 100, total: 100 },
    { description: "Venta de equipo XYZ", quantity: 1, unit_price: 500, total: 500 },
    { description: "Servicio de Logística", quantity: 1, unit_price: 2500, total: 2500 },
    { description: "Seguro de equipo", quantity: 1, unit_price: 800, total: 800 },
  ]);
  assertEquals(lines.map((l) => l.description), ["Servicio de Logística", "Seguro de equipo"]);
  assertEquals(lines[0].clave_prod_serv, "78101800");
  assertEquals(lines[1].clave_prod_serv, "84131500");
});

Deno.test("FIX-6: entradas inválidas o vacías devuelven []", () => {
  assertEquals(extractNonRentalLines(null), []);
  assertEquals(extractNonRentalLines([{ description: "Sin monto", total: 0 }]), []);
});
