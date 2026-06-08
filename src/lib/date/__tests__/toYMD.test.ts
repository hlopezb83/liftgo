import { describe, it, expect } from "vitest";
import { toYMD } from "../toYMD";

describe("toYMD", () => {
  it("formatea componentes locales", () => {
    expect(toYMD(new Date(2026, 5, 8))).toBe("2026-06-08");
    expect(toYMD(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toYMD(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("devuelve undefined para null/undefined", () => {
    expect(toYMD(null)).toBeUndefined();
    expect(toYMD(undefined)).toBeUndefined();
  });

  it("no se corre por offset UTC en horas de noche", () => {
    // 8 de junio a las 23:30 hora local → debe seguir siendo 2026-06-08
    expect(toYMD(new Date(2026, 5, 8, 23, 30))).toBe("2026-06-08");
  });
});
