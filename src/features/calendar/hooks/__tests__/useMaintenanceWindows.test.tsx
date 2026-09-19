import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMaintenanceWindows } from "../useMaintenanceWindows";

const mockUseMaintenanceLogs = vi.fn();

vi.mock("@/features/maintenance", () => ({
  useMaintenanceLogs: () => mockUseMaintenanceLogs(),
}));

const baseLog = {
  id: "log-1",
  forklift_id: "flt-1",
  service_type: "Preventivo",
  next_service_date: "2026-10-01",
  performed_at: "2026-09-15T18:30:00.000Z",
  work_status: "open",
};

describe("useMaintenanceWindows — contrato", () => {
  beforeEach(() => {
    mockUseMaintenanceLogs.mockReset();
  });

  it("sin registros devuelve lista vacía", () => {
    mockUseMaintenanceLogs.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useMaintenanceWindows());
    expect(result.current).toEqual([]);
  });

  it("genera franja de próximo servicio y de OT abierta con ids y etiquetas intactos", () => {
    mockUseMaintenanceLogs.mockReturnValue({ data: [baseLog] });
    const { result } = renderHook(() => useMaintenanceWindows());
    expect(result.current).toEqual([
      {
        id: "log-1-next",
        forklift_id: "flt-1",
        date: "2026-10-01",
        label: "Próximo servicio: Preventivo",
      },
      {
        id: "log-1-open",
        forklift_id: "flt-1",
        date: "2026-09-15",
        label: "OT abierta: Preventivo",
      },
    ]);
  });

  it("las OT completadas no generan franja abierta y el tipo falta usa 'mantenimiento'", () => {
    mockUseMaintenanceLogs.mockReturnValue({
      data: [
        { ...baseLog, id: "log-2", service_type: null, next_service_date: null, work_status: "completed" },
      ],
    });
    const { result } = renderHook(() => useMaintenanceWindows());
    expect(result.current).toEqual([]);

    mockUseMaintenanceLogs.mockReturnValue({
      data: [{ ...baseLog, id: "log-3", service_type: null, next_service_date: null }],
    });
    const { result: result2 } = renderHook(() => useMaintenanceWindows());
    expect(result2.current).toEqual([
      {
        id: "log-3-open",
        forklift_id: "flt-1",
        date: "2026-09-15",
        label: "OT abierta: mantenimiento",
      },
    ]);
  });
});
