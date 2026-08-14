import { describe, expect, it } from "vitest";
import {
  caretForSegment,
  digitsFromDate,
  digitsOf,
  formatMask,
  parseMaskedDate,
  segmentAtCaret,
  stepSegment,
} from "../parseMaskedDate";

describe("digitsOf", () => {
  it("descarta separadores y limita a 8 dígitos", () => {
    expect(digitsOf("15/09/2026")).toBe("15092026");
    expect(digitsOf("150920261234")).toBe("15092026");
  });
  it("acepta pegado en ISO", () => {
    expect(digitsOf("2026-09-15")).toBe("15092026");
  });
});

describe("formatMask", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["15", "15"],
    ["1509", "15/09"],
    ["15092026", "15/09/2026"],
  ])("formatea %s", (input, expected) => {
    expect(formatMask(input)).toBe(expected);
  });
});

describe("parseMaskedDate", () => {
  it("parsea una fecha completa", () => {
    const { date, complete, error } = parseMaskedDate("15/09/2026");
    expect(complete).toBe(true);
    expect(error).toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(15);
  });

  it("no reporta error mientras está incompleta", () => {
    expect(parseMaskedDate("1509")).toEqual({ date: null, complete: false, error: null });
  });

  it("rechaza fechas imposibles", () => {
    expect(parseMaskedDate("31/04/2026").error).toBe("31/04/2026 no existe");
    expect(parseMaskedDate("31/02/2026").date).toBeNull();
    expect(parseMaskedDate("15/13/2026").date).toBeNull();
    expect(parseMaskedDate("00/01/2026").date).toBeNull();
  });

  it("valida años bisiestos", () => {
    expect(parseMaskedDate("29/02/2024").date).not.toBeNull();
    expect(parseMaskedDate("29/02/2026").date).toBeNull();
    expect(parseMaskedDate("29/02/2000").date).not.toBeNull();
    expect(parseMaskedDate("29/02/1900").date).toBeNull();
  });
});

describe("digitsFromDate", () => {
  it("serializa por componentes locales", () => {
    expect(digitsFromDate(new Date(2026, 0, 5))).toBe("05012026");
    expect(digitsFromDate(undefined)).toBe("");
  });
});

describe("segmentos", () => {
  it("mapea el cursor al segmento", () => {
    expect(segmentAtCaret(0)).toBe(0);
    expect(segmentAtCaret(4)).toBe(1);
    expect(segmentAtCaret(8)).toBe(2);
  });
  it("posiciona el cursor al final del segmento disponible", () => {
    expect(caretForSegment(0, "15092026")).toBe(2);
    expect(caretForSegment(2, "15092026")).toBe(10);
    expect(caretForSegment(2, "15")).toBe(2);
  });
});

describe("stepSegment", () => {
  const fallback = new Date(2026, 7, 14);

  it("incrementa el día", () => {
    expect(stepSegment("15092026", 0, 1, fallback)).toBe("16092026");
  });
  it("incrementa el mes y recorta el día al máximo del mes destino", () => {
    expect(stepSegment("31012026", 1, 1, fallback)).toBe("28022026");
  });
  it("da la vuelta en día y mes", () => {
    expect(stepSegment("01092026", 0, -1, fallback)).toBe("30092026");
    expect(stepSegment("15122026", 1, 1, fallback)).toBe("15012026");
  });
  it("incrementa el año respetando bisiestos", () => {
    expect(stepSegment("29022024", 2, 1, fallback)).toBe("28022025");
  });
  it("parte de la fecha de referencia cuando la captura está incompleta", () => {
    expect(stepSegment("", 0, 1, fallback)).toBe("15082026");
  });
});
