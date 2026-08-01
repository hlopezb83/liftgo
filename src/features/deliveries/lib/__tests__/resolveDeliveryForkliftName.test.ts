import { describe, it, expect } from "vitest";
import { resolveDeliveryForkliftName } from "../resolveDeliveryForkliftName";

describe("resolveDeliveryForkliftName (R9-P2-06)", () => {
  const map = new Map([["mc-1", { name: "MC-101" }]]);

  it("prefiere el nombre que viene en el join de la consulta", () => {
    expect(
      resolveDeliveryForkliftName({ forklift_id: "mc-1", forklifts: { name: "MC-999" } }, map),
    ).toBe("MC-999");
  });

  it("cae al mapa de flota cuando el join viene vacío", () => {
    expect(resolveDeliveryForkliftName({ forklift_id: "mc-1", forklifts: null }, map)).toBe("MC-101");
  });

  it("devuelve undefined sólo si ninguna fuente tiene el nombre", () => {
    expect(
      resolveDeliveryForkliftName({ forklift_id: "desconocido", forklifts: null }, map),
    ).toBeUndefined();
  });

  it("no deja '—' cuando la unidad no está en el mapa pero sí en el join", () => {
    expect(
      resolveDeliveryForkliftName(
        { forklift_id: "fuera-de-pagina", forklifts: { name: "MC-207" } },
        map,
      ),
    ).toBe("MC-207");
  });
});
