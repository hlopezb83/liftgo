import { describe, expect, it } from "vitest";
import {
  countUnitsForModel,
  isDuplicateModel,
  validateNonNegative,
} from "../equipmentModelValidation";

describe("equipmentModelValidation", () => {
  const models = [
    { id: "1", manufacturer: "Hyster", model: "H50" },
    { id: "2", manufacturer: "toyota", model: "8FGCU25" },
  ];

  it("detects duplicates case-insensitive ignoring self", () => {
    expect(isDuplicateModel(models, " HYSTER ", "h50", null)).toBe(true);
    expect(isDuplicateModel(models, "Hyster", "H50", "1")).toBe(false);
    expect(isDuplicateModel(models, "Hyster", "H60", null)).toBe(false);
  });

  it("validates non-negative numeric fields", () => {
    expect(validateNonNegative("", "Tarifa")).toBeNull();
    expect(validateNonNegative("0", "Tarifa")).toBeNull();
    expect(validateNonNegative("10.5", "Tarifa")).toBeNull();
    expect(validateNonNegative("-1", "Tarifa")).toBe("Tarifa debe ser mayor o igual a 0");
    expect(validateNonNegative("abc", "Tarifa")).toBe("Tarifa debe ser mayor o igual a 0");
  });

  it("counts matching forklifts by manufacturer+model case-insensitive", () => {
    const forklifts = [
      { manufacturer: "HYSTER", model: "h50" },
      { manufacturer: "Hyster", model: "H50" },
      { manufacturer: "Toyota", model: "8FGCU25" },
      { manufacturer: null, model: null },
    ];
    expect(countUnitsForModel(forklifts, "Hyster", "H50")).toBe(2);
    expect(countUnitsForModel(forklifts, "Toyota", "8FGCU25")).toBe(1);
    expect(countUnitsForModel(forklifts, "Yale", "GLP050")).toBe(0);
  });
});
