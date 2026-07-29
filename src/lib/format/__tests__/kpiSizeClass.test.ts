import { describe, it, expect } from "vitest";
import { kpiSizeClass } from "@/lib/format/formatCurrency";

describe("kpiSizeClass", () => {
  it("usa el tamaño grande para valores cortos", () => {
    expect(kpiSizeClass("$1,200")).toBe("text-2xl");
    expect(kpiSizeClass("")).toBe("text-2xl");
    expect(kpiSizeClass("0123456789")).toBe("text-2xl");
  });

  it("reduce a text-xl para valores medianos", () => {
    expect(kpiSizeClass("01234567890")).toBe("text-xl");
  });

  it("reduce a text-lg para valores largos", () => {
    expect(kpiSizeClass("$1,234,567.89")).toBe("text-lg");
    expect(kpiSizeClass("0123456789012")).toBe("text-lg");
  });

  // R24-D: escalón extra para importes muy largos (evita el clipping a 1280px).
  it("reduce a text-base para valores muy largos", () => {
    expect(kpiSizeClass("012345678901234")).toBe("text-base");
    expect(kpiSizeClass("$12,345,678.90 MXN")).toBe("text-base");
  });
});
