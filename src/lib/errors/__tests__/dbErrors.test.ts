import { describe, it, expect } from "vitest";
import { translateDbError } from "../dbErrors";

describe("translateDbError", () => {
  it("detecta 'stale_write' y devuelve mensaje de warning en español", () => {
    const err = new Error(
      "stale_write: registro modificado por otro proceso (v3 < v5). Recarga los datos.",
    );
    const result = translateDbError(err, "Error al actualizar reserva");
    expect(result.matched).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.title).toBe("Cambios no guardados");
    expect(result.message).toMatch(/recarga/i);
  });

  it("regresa matched=false para errores desconocidos y preserva el título fallback", () => {
    const err = new Error("Some other DB error");
    const result = translateDbError(err, "Error al actualizar reserva");
    expect(result.matched).toBe(false);
    expect(result.severity).toBe("critical");
    expect(result.title).toBe("Error al actualizar reserva");
  });

  it("acepta strings crudos y objetos con .message", () => {
    expect(translateDbError("stale_write: foo", "X").matched).toBe(true);
    expect(translateDbError({ message: "stale_write: bar" }, "X").matched).toBe(true);
    expect(translateDbError(null, "X").matched).toBe(false);
  });

  it("BL-A2: traduce la exclusion constraint no_overlapping_bookings (23P01)", () => {
    const err = new Error(
      'conflicting key value violates exclusion constraint "no_overlapping_bookings"',
    );
    const result = translateDbError(err, "Error al extender reserva");
    expect(result.matched).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.title).toBe("Error al extender reserva");
    expect(result.message).toBe(
      "Las fechas se traslapan con otra reserva o con mantenimiento programado.",
    );
  });

  it("BL-A2: traduce cualquier exclusion violation aunque no nombre la constraint", () => {
    const result = translateDbError(
      { message: "conflicting key value violates exclusion constraint" },
      "Error al extender reserva",
    );
    expect(result.matched).toBe(true);
    expect(result.message).toMatch(/traslapan/);
  });
});
