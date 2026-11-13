import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { TestRouter } from "@/test/router";
import { maintenanceColumns } from "../../../pages/maintenanceColumns";
import { MaintenanceMobileCard } from "../MaintenanceRow";
import type { EnrichedMaintenanceLog } from "../../../lib/maintenancePageHelpers";

const STATUS_CASES = [
  ["pending", "Pendiente"],
  ["in_progress", "En Progreso"],
  ["waiting_parts", "Esperando Refacciones"],
  ["completed", "Completado"],
  ["cancelled", "Cancelado"],
];

function makeLog(workStatus: string, index = 0): EnrichedMaintenanceLog {
  return {
    id: `ot-${index}`, forklift_id: `fork-${index}`, forklift_name: `Equipo ${index + 1}`,
    service_type: "Mantenimiento", work_status: workStatus, cost: 650, manual_cost: 650,
    performed_at: "2026-11-13", performed_by: "Técnico", next_service_date: null,
    created_at: "2026-11-13T12:00:00Z", updated_at: "2026-11-13T12:00:00Z",
    deleted_at: null, deleted_by: null, description: null, supplier_id: null,
    organization_id: null, policy_id: null, policy_month: null, is_e2e: false, e2e_scope: null,
  };
}

describe("Mantenimiento: estado visible sin abrir el detalle", () => {
  it("muestra los cinco estados en sus filas y conserva la acción de consulta", async () => {
    const data = STATUS_CASES.map(([status], index) => makeLog(status, index));
    const onOpen = vi.fn();
    const { Wrapper } = createQueryWrapper();

    function MaintenanceTable() {
      const table = useLiftgoTable({ data, columns: maintenanceColumns, getRowId: (log) => log.id });
      return <DataTableV2 table={table} onRowClick={onOpen}
        rowAction={{ columnId: "forklift_name", label: (log) => `Ver servicio de ${log.forklift_name}` }} />;
    }

    render(<TestRouter><MaintenanceTable /></TestRouter>, { wrapper: Wrapper });
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Estado/ })).toBeInTheDocument();
    STATUS_CASES.forEach(([, label], index) => {
      const row = within(table).getByRole("row", { name: new RegExp(`Equipo ${index + 1}`) });
      expect(within(row).getByText(label)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver servicio de Equipo 5" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(data[4]);
  });

  it.each(STATUS_CASES)("muestra %s en la tarjeta y permite consultarla con teclado", (status, label) => {
    const onOpen = vi.fn();
    render(<MaintenanceMobileCard log={makeLog(status)} forkliftMap={new Map()} onClick={onOpen} />);
    const card = screen.getByRole("button");
    expect(within(card).getByText(label)).toBeInTheDocument();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
