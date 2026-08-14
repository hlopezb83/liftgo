import { describe, expect, it } from "vitest";
import {
  easterSunday,
  isMxHoliday,
  isWeekend,
  mxHolidayLabel,
  nextBusinessDay,
  nonBusinessDayNote,
  nthWeekday,
} from "../holidaysMx";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("easterSunday", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2030, "2030-04-21"],
  ])("calcula la Pascua de %i", (year, expected) => {
    const e = easterSunday(year);
    expect(`${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`).toBe(expected);
  });
});

describe("nthWeekday", () => {
  it("primer lunes de febrero 2026 es el 2", () => {
    expect(nthWeekday(2026, 1, 1, 1).getDate()).toBe(2);
  });
  it("tercer lunes de marzo 2026 es el 16", () => {
    expect(nthWeekday(2026, 2, 1, 3).getDate()).toBe(16);
  });
});

describe("mxHolidayLabel", () => {
  it("reconoce festivos fijos", () => {
    expect(mxHolidayLabel(d(2026, 1, 1))).toBe("Año Nuevo");
    expect(mxHolidayLabel(d(2026, 9, 16))).toBe("Día de la Independencia");
    expect(mxHolidayLabel(d(2026, 12, 25))).toBe("Navidad");
  });

  it("reconoce festivos movibles y bancarios", () => {
    expect(mxHolidayLabel(d(2026, 2, 2))).toBe("Día de la Constitución");
    expect(mxHolidayLabel(d(2026, 11, 16))).toBe("Día de la Revolución");
    // Pascua 2026 = 5 abril → jueves santo 2, viernes santo 3.
    expect(mxHolidayLabel(d(2026, 4, 2))).toContain("Jueves Santo");
    expect(mxHolidayLabel(d(2026, 4, 3))).toContain("Viernes Santo");
    expect(mxHolidayLabel(d(2026, 12, 12))).toContain("Guadalupe");
  });

  it("transmisión del poder ejecutivo solo cada 6 años", () => {
    expect(mxHolidayLabel(d(2030, 10, 1))).toContain("Transmisión");
    expect(mxHolidayLabel(d(2026, 10, 1))).toBeNull();
  });

  it("un día común no es festivo", () => {
    expect(isMxHoliday(d(2026, 8, 18))).toBe(false);
    expect(mxHolidayLabel(null)).toBeNull();
  });
});

describe("nonBusinessDayNote", () => {
  it("marca fines de semana", () => {
    expect(isWeekend(d(2026, 8, 15))).toBe(true); // sábado
    expect(nonBusinessDayNote(d(2026, 8, 15))).toBe("Sábado (día inhábil)");
    expect(nonBusinessDayNote(d(2026, 8, 16))).toBe("Domingo (día inhábil)");
  });

  it("el festivo tiene prioridad sobre el fin de semana", () => {
    // 1 de enero de 2028 es sábado.
    expect(nonBusinessDayNote(d(2028, 1, 1))).toBe("Año Nuevo");
  });

  it("día hábil no genera nota", () => {
    expect(nonBusinessDayNote(d(2026, 8, 18))).toBeNull();
  });
});

describe("nextBusinessDay", () => {
  it("salta el fin de semana", () => {
    const next = nextBusinessDay(d(2026, 8, 14)); // viernes
    expect(next.getDate()).toBe(17); // lunes
  });
  it("salta festivos consecutivos", () => {
    const next = nextBusinessDay(d(2026, 4, 1)); // miércoles antes de semana santa
    expect(next.getDate()).toBe(6); // lunes 6 (2 y 3 inhábiles, 4-5 fin de semana)
  });
});
