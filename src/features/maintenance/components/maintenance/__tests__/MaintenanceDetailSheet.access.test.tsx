import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MaintenanceDetailSheet } from "../MaintenanceDetailSheet";
import type { MaintenanceLog } from "../../../hooks/maintenance/useMaintenanceLogs";

const { role, edit } = vi.hoisted(() => ({ role: { value: "admin" }, edit: vi.fn() }));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: role.value }),
  useHasModuleAccess: () => true,
}));
vi.mock("@/features/suppliers", () => ({ useSuppliers: () => ({ data: [] }) }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../../hooks/maintenance/useMaintenanceLogs", () => ({
  useDeleteMaintenanceLog: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreMaintenanceLog: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../CloseWorkOrderDialog", () => ({ CloseWorkOrderDialog: () => null }));
vi.mock("../ReopenWorkOrderDialog", () => ({ ReopenWorkOrderDialog: () => null }));
vi.mock("../MaintenancePartsSection", () => ({
  MaintenancePartsSection: ({ readOnly }: { readOnly: boolean }) => <div>{readOnly ? "Refacciones en consulta" : "Captura de refacciones"}</div>,
}));
vi.mock("../MaintenanceLaborSection", () => ({
  MaintenanceLaborSection: ({ readOnly }: { readOnly: boolean }) => <div>{readOnly ? "Mano de obra en consulta" : "Captura de mano de obra"}</div>,
}));

const makeLog = (status: string) => ({
  id: "ot-a", forklift_id: "fork-a", service_type: "preventivo", work_status: status,
  performed_at: "2026-09-30", cost: 650, deleted_at: null,
} as MaintenanceLog);

describe("cabecera de OT cerrada", () => {
  it.each(["completed", "cancelled"])("admin consulta %s y debe reabrir antes de editar", (status) => {
    role.value = "admin";
    render(<MaintenanceDetailSheet log={makeLog(status)} open onOpenChange={vi.fn()} forkliftName="MTY-LG-2606" onEdit={edit} />);
    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cerrar ot$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reabrir ot$/i })).toBeEnabled();
    expect(screen.getByText("Refacciones en consulta")).toBeInTheDocument();
    expect(screen.getByText("Mano de obra en consulta")).toBeInTheDocument();
  });

  it("mecánico consulta la cerrada sin acciones de reapertura ni archivo", () => {
    role.value = "mechanic";
    render(<MaintenanceDetailSheet log={makeLog("completed")} open onOpenChange={vi.fn()} forkliftName="MTY-LG-2606" onEdit={edit} />);
    expect(screen.queryByRole("button", { name: /reabrir|archivar|editar/i })).not.toBeInTheDocument();
  });

  it("permite editar una OT abierta y refresca el costo del detalle sin cerrarlo", () => {
    role.value = "admin";
    const log = makeLog("in_progress");
    const props = { open: true, onOpenChange: vi.fn(), forkliftName: "MTY-LG-2606", onEdit: edit };
    const { rerender } = render(<MaintenanceDetailSheet {...props} log={{ ...log, cost: 0 }} />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    rerender(<MaintenanceDetailSheet {...props} log={log} />);
    expect(screen.getByText("$650.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^editar$/i }));
    expect(edit).toHaveBeenCalledWith(log);
  });
});
