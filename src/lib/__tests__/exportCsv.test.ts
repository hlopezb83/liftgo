import { describe, expect, it } from "vitest";

import { sanitizeCsvCell } from "@/lib/exportCsv";

describe("sanitizeCsvCell (M-11 · inyección de fórmulas)", () => {
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@cmd"])("prefija con comilla: %s", (value) => {
    expect(sanitizeCsvCell(value)).toBe(`'${value}`);
  });

  it("no altera texto normal", () => {
    expect(sanitizeCsvCell("FAC-0094")).toBe("FAC-0094");
  });

  it("no altera números negativos ni otros tipos", () => {
    expect(sanitizeCsvCell(-1500.25)).toBe(-1500.25);
    expect(sanitizeCsvCell(null)).toBeNull();
    expect(sanitizeCsvCell(undefined)).toBeUndefined();
    expect(sanitizeCsvCell(true)).toBe(true);
  });
});
