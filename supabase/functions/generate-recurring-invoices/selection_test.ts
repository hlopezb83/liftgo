import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectTargetItems } from "./selection.ts";

const items = [
  { bookingId: "b1", startStr: "2026-08-01" },
  { bookingId: "b1", startStr: "2026-09-01" },
  { bookingId: "b2", startStr: "2026-09-01" },
];

Deno.test("R9-18: selections vacío no genera nada (fail-closed)", () => {
  assertEquals(selectTargetItems(items, { selections: [] })?.length, 0);
});

Deno.test("R9-18: selections con una combinación válida sólo procesa esa", () => {
  const out = selectTargetItems(items, {
    selections: [{ bookingId: "b1", periodStart: "2026-09-01" }],
  });
  assertEquals(out, [{ bookingId: "b1", startStr: "2026-09-01" }]);
});

Deno.test("R9-18: entradas inválidas nunca caen a allItems", () => {
  assertEquals(
    selectTargetItems(items, { selections: [{ bookingId: "b1" }] })?.length,
    0,
  );
  assertEquals(
    selectTargetItems(items, {
      selections: [{ periodStart: "2026-09-01" }],
      bookingIds: ["b1", "b2"],
    })?.length,
    0,
  );
});

Deno.test("R9-18: selección válida inexistente no genera nada", () => {
  assertEquals(
    selectTargetItems(items, {
      selections: [{ bookingId: "bX", periodStart: "2026-09-01" }],
    })?.length,
    0,
  );
});

Deno.test("R9-18: sin selections, bookingIds conserva el retry legacy", () => {
  const out = selectTargetItems(items, { bookingIds: ["b2"] });
  assertEquals(out, [{ bookingId: "b2", startStr: "2026-09-01" }]);
});

Deno.test("R9-18: bookingIds vacío no genera nada (fail-closed)", () => {
  assertEquals(selectTargetItems(items, { bookingIds: [] })?.length, 0);
});

Deno.test("R9-18: sin ningún selector devuelve null (el caller responde 400)", () => {
  assertEquals(selectTargetItems(items, {}), null);
});
