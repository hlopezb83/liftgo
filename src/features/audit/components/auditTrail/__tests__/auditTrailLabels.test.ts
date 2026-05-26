import { describe, it, expect } from "vitest";
import { translateField, translateAction, translateTable, HIDDEN_DIFF_FIELDS } from "../auditTrailLabels";

describe("auditTrailLabels", () => {
  it("traduce campos conocidos al español", () => {
    expect(translateField("status")).toBe("Estado");
    expect(translateField("daily_rate")).toBe("Tarifa Diaria");
    expect(translateField("customer_name")).toBe("Nombre del Cliente");
  });

  it("fallback: reemplaza _ por espacio en campos desconocidos", () => {
    expect(translateField("foo_bar_baz")).toBe("foo bar baz");
  });

  it("traduce acciones INSERT/UPDATE/DELETE", () => {
    expect(translateAction("INSERT")).toBe("Creación");
    expect(translateAction("UPDATE")).toBe("Actualización");
    expect(translateAction("DELETE")).toBe("Eliminación");
    expect(translateAction("OTHER")).toBe("OTHER");
  });

  it("traduce nombres de tablas", () => {
    expect(translateTable("bookings")).toBe("Reservas");
    expect(translateTable("invoices")).toBe("Facturas");
    expect(translateTable("custom_table")).toBe("custom table");
  });

  it("HIDDEN_DIFF_FIELDS contiene los campos del sistema", () => {
    expect(HIDDEN_DIFF_FIELDS.has("updated_at")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("stage_order")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("search_vector")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("status")).toBe(false);
  });
});
