import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseDateLocal,
  formatDateRange,
  formatMtyDate,
  nowMty,
} from "@/lib/utils";

describe("parseDateLocal", () => {
  it("parsea 'YYYY-MM-DD' como fecha LOCAL (sin off-by-one)", () => {
    const d = parseDateLocal("2024-01-15")!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it("ignora la parte de tiempo cuando viene con sufijo T", () => {
    const d = parseDateLocal("2024-03-10T00:00:00Z")!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(10);
  });

  it("último día del año sin off-by-one", () => {
    const d = parseDateLocal("2024-12-31")!;
    expect(d.getDate()).toBe(31);
    expect(d.getMonth()).toBe(11);
  });

  it("null/undefined/'' devuelve null en lugar de lanzar (Bloque 2.2)", () => {
    expect(parseDateLocal(null)).toBeNull();
    expect(parseDateLocal(undefined)).toBeNull();
    expect(parseDateLocal("")).toBeNull();
    expect(parseDateLocal("not-a-date")).toBeNull();
  });

  it("acepta 'YYYY-MM' (month_key) usando día 1", () => {
    const d = parseDateLocal("2026-04")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(1);
  });
});

describe("formatDateRange", () => {
  it("null/null → '—'", () => {
    expect(formatDateRange(null, null)).toBe("—");
  });

  it("undefined/undefined → '—'", () => {
    expect(formatDateRange(undefined, undefined)).toBe("—");
  });

  it("start === end → una sola fecha", () => {
    expect(formatDateRange("2024-06-15", "2024-06-15")).toBe("15/06/2024");
  });

  it("rango distinto → con guión largo", () => {
    expect(formatDateRange("2024-06-01", "2024-06-30")).toBe("01/06/2024 – 30/06/2024");
  });

  it("solo start → muestra start", () => {
    expect(formatDateRange("2024-08-20", null)).toBe("20/08/2024");
  });

  it("solo end → muestra end", () => {
    expect(formatDateRange(null, "2024-08-20")).toBe("20/08/2024");
  });
});

describe("formatMtyDate", () => {
  it("null → '—'", () => {
    expect(formatMtyDate(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatMtyDate(undefined)).toBe("—");
  });

  it("06:00 UTC = 00:00 MX (CST UTC-6) → muestra día correcto Monterrey", () => {
    expect(formatMtyDate("2024-03-15T06:00:00Z")).toBe("15/03/2024");
  });

  it("05:59 UTC = 23:59 día anterior MX → muestra día anterior", () => {
    expect(formatMtyDate("2024-03-15T05:59:00Z")).toBe("14/03/2024");
  });

  it("acepta objeto Date", () => {
    expect(formatMtyDate(new Date("2024-01-20T18:00:00Z"))).toBe("20/01/2024");
  });

  it("acepta patrón personalizado", () => {
    expect(formatMtyDate("2024-06-01T18:00:00Z", "yyyy/MM/dd")).toBe("2024/06/01");
  });
});

describe("nowMty", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve un Date", () => {
    expect(nowMty()).toBeInstanceOf(Date);
  });

  it("refleja zona America/Monterrey, no UTC", () => {
    vi.useFakeTimers();
    // 03:00 UTC = 21:00 día anterior en Monterrey (CST UTC-6)
    vi.setSystemTime(new Date("2024-01-15T03:00:00Z"));
    const mty = nowMty();
    expect(mty.getDate()).toBe(14);
    expect(mty.getHours()).toBe(21);
  });
});
