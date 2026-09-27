import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceDetailSheet } from "../kanban/MaintenanceDetailSheet";
import { MaintenanceKanbanColumn } from "../kanban/MaintenanceKanbanColumn";
import type { MaintenanceLog } from "../../../hooks/maintenance/useMaintenanceLogs";

const mocks = vi.hoisted(() => ({
  pointer: vi.fn(), keyboard: vi.fn(), sortable: vi.fn(), droppable: vi.fn(),
}));
vi.mock("@dnd-kit/core", () => ({
  useDroppable: (options: unknown) => { mocks.droppable(options); return { setNodeRef: vi.fn(), isOver: false }; },
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  verticalListSortingStrategy: vi.fn(),
  useSortable: (options: unknown) => {
    mocks.sortable(options);
    return {
      attributes: { role: "button", tabIndex: 0 },
      listeners: { onPointerDown: mocks.pointer, onKeyDown: mocks.keyboard },
      setNodeRef: vi.fn(), transform: null, transition: undefined, isDragging: false,
    };
  },
}));
vi.mock("@/features/inventory", () => ({
  usePartsInventory: () => ({ data: [], isLoading: false }),
  useMaintenanceParts: () => ({ data: [], isLoading: false }),
  useAddMaintenancePart: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMaintenanceLabor", () => ({
  useMaintenanceLabor: () => ({ data: [], isLoading: false }),
  useAddMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMechanics", () => ({ useActiveMechanics: () => ({ data: [] }) }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));

const log = {
  id: "log-1", forklift_name: "MTY-LG-2604", service_type: "Mantenimiento",
  performed_at: "2026-09-26", work_status: "pending", deleted_at: null, cost: 0,
} as MaintenanceLog & { forklift_name: string };

beforeEach(() => vi.clearAllMocks());

describe("Tablero mantenimiento · consulta y orden terminal", () => {
  it.each([
    [false, "pending", null, false],
    [true, "completed", null, false],
    [true, "cancelled", null, false],
    [true, "pending", "2026-09-26T20:00:00Z", false],
    [true, "pending", null, true],
  ])("canWrite=%s, estado=%s, archivo=%s permite captura=%s", (canWrite, work_status, deleted_at, expected) => {
    render(<MaintenanceDetailSheet log={{ ...log, work_status, deleted_at }} canWrite={canWrite} onClose={vi.fn()} />);
    expect(Boolean(screen.queryByPlaceholderText("Horas"))).toBe(expected);
    expect(Boolean(screen.queryByText("Buscar refacción…"))).toBe(expected);
    expect(screen.getByText("Refacciones Utilizadas")).toBeInTheDocument();
    expect(screen.getByText("Mano de Obra")).toBeInTheDocument();
  });

  it.each([[false, "pending"], [true, "completed"]])("no arrastra canWrite=%s, estado=%s pero permite consultar con teclado", (canWrite, work_status) => {
    const onSelect = vi.fn();
    render(<MaintenanceKanbanColumn id="pending" label="Pendiente" icon={() => null} color="" bg="" border="" items={[{ ...log, work_status }]} canWrite={canWrite} onSelectLog={onSelect} />);
    const card = screen.getByTestId("maintenance-kanban-card-log-1");
    fireEvent.pointerDown(card);
    expect(mocks.pointer).not.toHaveBeenCalled();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(mocks.sortable).toHaveBeenCalledWith(expect.objectContaining({ disabled: { draggable: true, droppable: !canWrite } }));
  });

  it("conserva arrastre para una orden abierta y permiso full", () => {
    render(<MaintenanceKanbanColumn id="pending" label="Pendiente" icon={() => null} color="" bg="" border="" items={[log]} canWrite onSelectLog={vi.fn()} />);
    fireEvent.pointerDown(screen.getByTestId("maintenance-kanban-card-log-1"));
    expect(mocks.pointer).toHaveBeenCalledOnce();
    expect(mocks.sortable).toHaveBeenCalledWith(expect.objectContaining({ disabled: { draggable: false, droppable: false } }));
  });
});
