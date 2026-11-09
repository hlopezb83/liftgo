import { describe, expect, it } from "vitest";
import { CLAVE_PROD_SERV, CLAVE_UNIDAD } from "../domain/satCatalogs";

describe("equipment SAT choices preserve the existing catalog", () => {
  it("retains every service choice in order and appends explicit equipment choices", () => {
    expect(CLAVE_PROD_SERV.map(({ code }) => code)).toEqual([
      "78181500", "78181501", "78181600", "81141601", "81112100", "24101602", "24101603",
    ]);
    expect(CLAVE_PROD_SERV.slice(-2)).toEqual([
      { code: "24101602", label: "24101602 - Montacargas" },
      { code: "24101603", label: "24101603 - Elevadores forklift" },
    ]);
  });
  it("retains every service/time unit and adds piece without replacing defaults", () => {
    expect(CLAVE_UNIDAD.map(({ code }) => code)).toEqual(["E48", "DAY", "WEE", "MON", "HUR", "ACT", "H87"]);
    expect(CLAVE_UNIDAD.at(-1)).toEqual({ code: "H87", label: "H87 - Pieza" });
  });
});
