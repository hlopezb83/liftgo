import { describe, it, expect } from "vitest";
import { translateActivityTitle, translateActivityDescription } from "@/lib/domain/activityTranslations";

describe("translateActivityTitle", () => {
  it("traduce títulos legacy en inglés", () => {
    expect(translateActivityTitle("INSERT on bookings", "INSERT", "bookings")).toBe("Creación de Reservas");
    expect(translateActivityTitle("UPDATE on invoices", "UPDATE", "invoices")).toBe("Actualización de Facturas");
    expect(translateActivityTitle("DELETE on customers", "DELETE", "customers")).toBe("Eliminación de Clientes");
  });

  it("deja pasar títulos ya en español", () => {
    expect(translateActivityTitle("Creación de Factura FAC-001", "INSERT", "invoices")).toBe("Creación de Factura FAC-001");
  });
});

describe("translateActivityDescription", () => {
  it("traduce descripciones legacy en inglés", () => {
    expect(translateActivityDescription("A booking was created", "INSERT", "bookings")).toBe("Se creó un registro de Reservas");
    expect(translateActivityDescription("A booking was updated", "UPDATE", "bookings")).toBe("Se actualizó un registro de Reservas");
    expect(translateActivityDescription("A booking was deleted", "DELETE", "bookings")).toBe("Se eliminó un registro de Reservas");
  });

  it("deja pasar descripciones en español", () => {
    expect(translateActivityDescription("Cliente registró pago", "UPDATE", "payments")).toBe("Cliente registró pago");
  });

  it("devuelve '' para null", () => {
    expect(translateActivityDescription(null, "INSERT", "bookings")).toBe("");
  });
});
