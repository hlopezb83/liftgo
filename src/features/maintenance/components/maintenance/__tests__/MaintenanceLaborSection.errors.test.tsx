import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ error: true, mechanicError: false, refetch: vi.fn(), mutate: vi.fn() }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("../../../hooks/maintenance/useMaintenanceLabor", () => ({
  useMaintenanceLabor: () => ({ data: undefined, isLoading: false, isError: state.error, refetch: state.refetch }),
  useAddMaintenanceLabor: () => ({ mutate: state.mutate, isPending: false }),
  useDeleteMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMechanics", () => ({ useActiveMechanics: () => ({ data: [], isLoading: false, isError: state.mechanicError, refetch: state.refetch }) }));
import { MaintenanceLaborSection } from "../MaintenanceLaborSection";
beforeEach(() => { state.error = true; state.mechanicError = false; vi.clearAllMocks(); });
it("shows failed reads as errors, retries and preserves entered hours, rate and notes", () => {
  state.error = false;
  const view = render(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  fireEvent.change(screen.getByPlaceholderText("Horas"), { target: { value: "3" } });
  fireEvent.change(screen.getByPlaceholderText("Tarifa/hr"), { target: { value: "120" } });
  fireEvent.change(screen.getByPlaceholderText("Notas (opcional)"), { target: { value: "Trabajo pendiente" } });
  state.error = true;
  view.rerender(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.getByText("No se pudo cargar la mano de obra")).toBeInTheDocument();
  expect(screen.queryByText("Sin mano de obra registrada.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(state.refetch).toHaveBeenCalledOnce();
  state.error = false;
  view.rerender(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.getByPlaceholderText("Horas")).toHaveValue(3);
  expect(screen.getByPlaceholderText("Tarifa/hr")).toHaveValue(120);
  expect(screen.getByPlaceholderText("Notas (opcional)")).toHaveValue("Trabajo pendiente");
  expect(screen.getByText("Sin mano de obra registrada.")).toBeInTheDocument();
});
it("keeps read-only access and does not offer capture during an error", () => {
  render(<MaintenanceLaborSection maintenanceLogId="ot-a" readOnly />);
  expect(screen.getByText("No se pudo cargar la mano de obra")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Agregar" })).not.toBeInTheDocument();
});
it("offers a separate retry when the mechanics needed for capture cannot be loaded", () => {
  state.error = false; state.mechanicError = true;
  render(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.getByText("No se pudo cargar los mecánicos")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
