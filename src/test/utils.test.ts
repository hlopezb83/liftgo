import { describe, it, expect } from "vitest";
import {
  cn,
  parseDateLocal,
  formatDateDisplay,
  formatDateRange,
  formatMtyDate,
  capitalize,
  nowMty,
} from "@/lib/utils";

describe("cn", () => {
  it("combina clases y deduplica tailwind", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", null, undefined, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("parseDateLocal", () => {
  it("parsea YYYY-MM-DD como fecha local (evita off-by-one)", () => {
    const d = parseDateLocal("2026-05-26")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // mayo = 4
    expect(d.getDate()).toBe(26);
  });

  it("tolera strings ISO con tiempo", () => {
    const d = parseDateLocal("2026-01-15T10:30:00Z")!;
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(0);
  });
});

describe("formatDateDisplay", () => {
  it("formatea en DD/MM/YYYY", () => {
    expect(formatDateDisplay("2026-05-26")).toBe("26/05/2026");
  });

  it("devuelve '—' para null/undefined/empty", () => {
    expect(formatDateDisplay(null)).toBe("—");
    expect(formatDateDisplay(undefined)).toBe("—");
    expect(formatDateDisplay("")).toBe("—");
  });
});

describe("formatDateRange", () => {
  it("muestra una sola fecha cuando inicio == fin", () => {
    expect(formatDateRange("2026-05-26", "2026-05-26")).toBe("26/05/2026");
  });

  it("muestra rango con guión largo cuando difieren", () => {
    expect(formatDateRange("2026-05-01", "2026-05-31")).toBe("01/05/2026 – 31/05/2026");
  });

  it("devuelve '—' cuando ambos son nulos", () => {
    expect(formatDateRange(null, null)).toBe("—");
  });

  it("usa el lado disponible si solo uno existe", () => {
    expect(formatDateRange("2026-05-01", null)).toBe("01/05/2026");
    expect(formatDateRange(null, "2026-05-31")).toBe("31/05/2026");
  });
});

describe("formatMtyDate", () => {
  it("devuelve '—' para valores nulos", () => {
    expect(formatMtyDate(null)).toBe("—");
    expect(formatMtyDate(undefined)).toBe("—");
  });

  it("usa el patrón dd/MM/yyyy por defecto", () => {
    const result = formatMtyDate("2026-05-26T12:00:00Z");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("capitalize", () => {
  it("capitaliza la primera letra", () => {
    expect(capitalize("hola")).toBe("Hola");
    expect(capitalize("MUNDO")).toBe("MUNDO");
    expect(capitalize("")).toBe("");
  });
});

describe("nowMty", () => {
  it("devuelve una Date válida", () => {
    const d = nowMty();
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
