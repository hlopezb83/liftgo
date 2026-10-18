import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regresión V04: las etiquetas KPI de conciliación deben verse íntegras
// (sin line-clamp) y los valores con ruptura de emergencia.
const source = readFileSync(
  resolve(__dirname, "../InvoicesReconciliation.tsx"),
  "utf8",
);

describe("InvoicesReconciliation · etiquetas KPI íntegras (V04 fix)", () => {
  it("no trunca etiquetas con line-clamp", () => {
    expect(source).not.toContain("line-clamp");
  });

  it("reserva la zona de etiqueta y permite ruptura de emergencia", () => {
    expect(source).toContain("min-h-[2.5em]");
    expect(source).toContain("[overflow-wrap:anywhere]");
  });
});
