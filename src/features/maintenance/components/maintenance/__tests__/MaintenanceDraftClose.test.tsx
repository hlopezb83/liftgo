import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MaintenanceDetailSheet } from "../MaintenanceDetailSheet";
import { MaintenanceDetailSheet as KanbanDetail } from "../kanban/MaintenanceDetailSheet";
import type { MaintenanceLog } from "../../../hooks/maintenance/useMaintenanceLogs";

vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }), useHasModuleAccess: () => true }));
vi.mock("@/features/suppliers", () => ({ useSuppliers: () => ({ data: [] }) }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("../../../hooks/maintenance/useMaintenanceLogs", () => ({
  useDeleteMaintenanceLog: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreMaintenanceLog: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMaintenanceLabor", () => ({
  useMaintenanceLabor: () => ({ data: [], isLoading: false, isError: false }),
  useAddMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMechanics", () => ({ useActiveMechanics: () => ({
  data: [{ id: "m-a", name: "Mecánico A" }], isLoading: false, isError: false, isSuccess: true,
}) }));
vi.mock("../MaintenancePartsSection", () => ({ MaintenancePartsSection: () => null }));
vi.mock("../CloseWorkOrderDialog", () => ({ CloseWorkOrderDialog: () => null }));
vi.mock("../ReopenWorkOrderDialog", () => ({ ReopenWorkOrderDialog: () => null }));

const log = { id: "ot-a", forklift_id: "fork-a", service_type: "preventivo", work_status: "in_progress",
  performed_at: "2026-11-14", cost: 0, deleted_at: null, forklift_name: "Equipo A" } as MaintenanceLog & { forklift_name: string };
function Harness({ kanban }: { kanban: boolean }) {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(true)}>Reabrir panel</button>{kanban
    ? <KanbanDetail log={open ? log : null} onClose={() => setOpen(false)} canWrite />
    : <MaintenanceDetailSheet log={log} open={open} onOpenChange={setOpen} forkliftName="Equipo A" onEdit={vi.fn()} />}</>;
}

it.each([false, true])("protects unregistered labor on Escape, retains on cancel and resets on discard (kanban=%s)", async (kanban) => {
  render(<Harness kanban={kanban} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Horas" }), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" }), { target: { value: "150" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Notas (opcional)" }), { target: { value: "Trabajo pendiente" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Notas (opcional)" }), { key: "Escape" });
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.getByRole("spinbutton", { name: "Horas" })).toHaveValue(2);
  expect(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" })).toHaveValue(150);
  expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveValue("Trabajo pendiente");
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Notas (opcional)" }), { key: "Escape" });
  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Reabrir panel" }));
  expect(screen.getByRole("spinbutton", { name: "Horas" })).toHaveValue(null);
  expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveValue("");
});
