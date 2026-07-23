import { describe, it, expect } from "vitest";
import {
  buildMaintenancePayload,
  maintenanceLogToFormValues,
  initialMaintenanceForm,
  maintenanceFormSchema,
} from "../maintenanceFormHelpers";
import type { MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";

describe("maintenanceFormSchema", () => {
  it("acepta payload mínimo válido", () => {
    const r = maintenanceFormSchema.safeParse({
      ...initialMaintenanceForm,
      forkliftId: "f1",
      serviceType: "preventivo",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza sin montacargas", () => {
    const r = maintenanceFormSchema.safeParse({ ...initialMaintenanceForm, serviceType: "x" });
    expect(r.success).toBe(false);
  });

  it("rechaza sin tipo de servicio", () => {
    const r = maintenanceFormSchema.safeParse({ ...initialMaintenanceForm, forkliftId: "f1" });
    expect(r.success).toBe(false);
  });

  it("rechaza costo negativo", () => {
    const r = maintenanceFormSchema.safeParse({
      ...initialMaintenanceForm, forkliftId: "f1", serviceType: "x", cost: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("buildMaintenancePayload", () => {
  it("escribe el costo en manual_cost y formatea fechas", () => {
    const payload = buildMaintenancePayload({
      forkliftId: "f1", serviceType: "preventivo",
      description: "filtros", cost: 1500.5,
      performedBy: "Juan",
      performedAt: new Date("2026-03-15T12:00:00"),
      nextServiceDate: new Date("2026-09-15T12:00:00"),
      supplierId: "s1",
    });
    expect(payload).toMatchObject({
      forklift_id: "f1",
      service_type: "preventivo",
      description: "filtros",
      manual_cost: 1500.5,
      performed_by: "Juan",
      performed_at: "2026-03-15",
      next_service_date: "2026-09-15",
      supplier_id: "s1",
    });
  });

  it("convierte campos vacíos a null y costo null a 0", () => {
    const payload = buildMaintenancePayload({
      forkliftId: "f1", serviceType: "x",
      description: "", cost: null, performedBy: "",
      performedAt: new Date("2026-03-15T12:00:00"),
      nextServiceDate: undefined, supplierId: "",
    });
    expect(payload.description).toBeNull();
    expect(payload.performed_by).toBeNull();
    expect(payload.supplier_id).toBeNull();
    expect(payload.next_service_date).toBeNull();
    expect(payload.manual_cost).toBe(0);
  });
});

describe("maintenanceLogToFormValues", () => {
  it("prellena cost desde manual_cost (no desde cost calculado)", () => {
    const log = {
      forklift_id: "f1", service_type: "correctivo",
      description: "alternador", cost: 3800, manual_cost: 3500,
      performed_by: "Pedro",
      performed_at: "2026-04-10",
      next_service_date: "2026-10-10",
      supplier_id: "s9",
    } as unknown as MaintenanceLog;
    const v = maintenanceLogToFormValues(log);
    expect(v.forkliftId).toBe("f1");
    expect(v.cost).toBe(3500);
    expect(v.performedAt.getFullYear()).toBe(2026);
    expect(v.supplierId).toBe("s9");
  });

  it("usa defaults razonables cuando faltan campos", () => {
    const log = {
      forklift_id: "f1", service_type: "x",
      description: null, cost: null, manual_cost: null, performed_by: null,
      performed_at: null, next_service_date: null, supplier_id: null,
    } as unknown as MaintenanceLog;
    const v = maintenanceLogToFormValues(log);
    expect(v.description).toBe("");
    expect(v.cost).toBeNull();
    expect(v.performedBy).toBe("");
    expect(v.supplierId).toBe("");
    expect(v.nextServiceDate).toBeUndefined();
    expect(v.performedAt).toBeInstanceOf(Date);
  });
});
