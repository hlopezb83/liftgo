import { assertEquals } from "@std/assert";
import { buildNotesSection } from "./notesSection.ts";

Deno.test("notas: sin notas no envía sección", () => {
  assertEquals(buildNotesSection(null), undefined);
  assertEquals(buildNotesSection("   "), undefined);
});

Deno.test("notas: escapa HTML y conserva saltos de línea", () => {
  assertEquals(
    buildNotesSection("OC PO-1 <b>\nPago 30 días"),
    "<p><strong>Notas:</strong><br>OC PO-1 &lt;b&gt;<br>Pago 30 días</p>",
  );
});
