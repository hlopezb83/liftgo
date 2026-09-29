import { describe, expect, it } from "vitest";
import { filterSaleForkliftsForLine } from "../saleForkliftMatching";

const candidates = [
  {
    id: "multi-word",
    status: "available",
    manufacturer: "Hyster",
    model: "H50FT 3-Stage Mast",
  },
  {
    id: "short-prefix",
    status: "available",
    manufacturer: "Hyster",
    model: "H50FT",
  },
  {
    id: "maintenance",
    status: "maintenance",
    manufacturer: "Hyster",
    model: "H50FT 3-Stage Mast",
  },
];

describe("filterSaleForkliftsForLine", () => {
  it("matches a complete multi-word model and excludes shorter prefixes", () => {
    const available = filterSaleForkliftsForLine(
      "Hyster H50FT 3-Stage Mast - Venta de equipo",
      candidates,
      new Set(),
    );

    expect(available.map((forklift) => forklift.id)).toEqual(["multi-word"]);
  });

  it("excludes already assigned units", () => {
    const available = filterSaleForkliftsForLine(
      "Hyster H50FT 3-Stage Mast - Venta de equipo",
      candidates,
      new Set(["multi-word"]),
    );

    expect(available).toEqual([]);
  });
});
