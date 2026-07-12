import { describe, it, expect } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { enrichLogs, forkliftName, maintenanceCsvRows, sumCost } from "../maintenancePageHelpers";
import type { MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";

const forkliftMap = new Map<string, Tables<"forklifts">>([
  ["f1", { id: "f1", name: "MC-001" } as Tables<"forklifts">],
  ["f2", { id: "f2", name: "MC-002" } as Tables<"forklifts">],
]);

const logs = [
  { id: "1", forklift_id: "f1", service_type: "preventivo", performed_at: "2026-01-10", performed_by: "Juan", cost: 1500, next_service_date: "2026-07-10" },
  { id: "2", forklift_id: "f2", service_type: "correctivo", performed_at: "2026-02-15", performed_by: null, cost: null, next_service_date: null },
] as unknown as MaintenanceLog[];

describe("maintenancePageHelpers", () => {
  it("forkliftName devuelve nombre o '' si no existe", () => {
    expect(forkliftName(forkliftMap, "f1")).toBe("MC-001");
    expect(forkliftName(forkliftMap, "nope")).toBe("");
  });

  it("enrichLogs agrega forklift_name a cada log", () => {
    const enriched = enrichLogs(logs, forkliftMap);
    expect(enriched[0].forklift_name).toBe("MC-001");
    expect(enriched[1].forklift_name).toBe("MC-002");
  });

  it("enrichLogs tolera undefined", () => {
    expect(enrichLogs(undefined, forkliftMap)).toEqual([]);
  });

  it("sumCost suma costos ignorando null", () => {
    expect(sumCost(logs)).toBe(1500);
    expect(sumCost(undefined)).toBe(0);
  });

  it("maintenanceCsvRows produce filas en español con fallbacks", () => {
    const rows = maintenanceCsvRows(logs, forkliftMap);
    expect(rows[0]).toEqual({
      Fecha: "2026-01-10", Montacargas: "MC-001", Servicio: "preventivo",
      "Realizado Por": "Juan", Costo: 1500, "Próximo Servicio": "2026-07-10",
    });
    expect(rows[1]["Realizado Por"]).toBe("");
    expect(rows[1].Costo).toBe(0);
    expect(rows[1]["Próximo Servicio"]).toBe("");
  });
});
