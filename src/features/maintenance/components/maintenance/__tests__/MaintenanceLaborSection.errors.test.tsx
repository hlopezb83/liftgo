import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  error: true, mechanicError: false, mechanicLoading: false, mechanicSuccess: true,
  mechanics: [] as { id: string; name: string }[], access: "none", refetch: vi.fn(), mutate: vi.fn(),
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: (module: string, access: string) => module === "Configuración" && access === "full" && state.access === "full" }));
vi.mock("@/lib/router-compat-ui", () => ({ Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("../../../hooks/maintenance/useMaintenanceLabor", () => ({
  useMaintenanceLabor: () => ({ data: undefined, isLoading: false, isError: state.error, refetch: state.refetch }),
  useAddMaintenanceLabor: () => ({ mutate: state.mutate, isPending: false }),
  useDeleteMaintenanceLabor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/maintenance/useMechanics", () => ({ useActiveMechanics: () => ({
  data: state.mechanics, isLoading: state.mechanicLoading, isError: state.mechanicError,
  isSuccess: state.mechanicSuccess && !state.mechanicError && !state.mechanicLoading, refetch: state.refetch,
}) }));
import { MaintenanceLaborSection } from "../MaintenanceLaborSection";
beforeEach(() => {
  state.error = true; state.mechanicError = false; state.mechanicLoading = false; state.mechanicSuccess = true;
  state.mechanics = []; state.access = "none"; vi.clearAllMocks();
});
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
  expect(screen.queryByText(/No hay mecánicos activos/)).not.toBeInTheDocument();
});

it.each(["none", "read", "full"])("empty mechanics offers only a permitted next step with %s settings access", (access) => {
  state.error = false; state.access = access;
  render(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.getByText(/No hay mecánicos activos/)).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Mecánico" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  expect(state.mutate).not.toHaveBeenCalled();
  if (access === "full") {
    expect(screen.getByRole("link", { name: "Ir a Configuración" })).toHaveAttribute("href", "/settings/operations");
    expect(screen.getByText(/pestaña Mecánicos/)).toBeInTheDocument();
  } else {
    expect(screen.queryByRole("link", { name: "Ir a Configuración" })).not.toBeInTheDocument();
    expect(screen.getByText(/Solicita a un administrador/)).toBeInTheDocument();
  }
});

it("does not announce an empty catalog before a successful query", () => {
  state.error = false; state.mechanicLoading = true;
  const view = render(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.queryByText(/No hay mecánicos activos/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  state.mechanicLoading = false; state.mechanicSuccess = false;
  view.rerender(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.queryByText(/No hay mecánicos activos/)).not.toBeInTheDocument();
});

it("restores capture with an active mechanic and preserves numeric values and optional notes", async () => {
  state.error = false;
  const view = render(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  state.mechanics = [{ id: "mechanic-a", name: "Mecánico de prueba" }];
  view.rerender(<MaintenanceLaborSection maintenanceLogId="ot-a" />);
  expect(screen.queryByText(/No hay mecánicos activos/)).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Mecánico" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Mecánico de prueba" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Horas" }), { target: { value: "1.25" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" }), { target: { value: "120.50" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Notas (opcional)" }), { target: { value: "  Revisión  " } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  expect(state.mutate).toHaveBeenCalledWith({
    maintenance_log_id: "ot-a", mechanic_id: "mechanic-a", hours: 1.25, hourly_rate: 120.5, notes: "Revisión",
  }, expect.any(Object));
});

it.each(["", "0", "-1"])("focuses invalid hours %j and preserves the rest of the draft without saving", async (hours) => {
  state.error = false;
  state.mechanics = [{ id: "mechanic-a", name: "Mecánico de prueba" }];
  const onDraftChange = vi.fn();
  render(<MaintenanceLaborSection maintenanceLogId="ot-a" onDraftChange={onDraftChange} />);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Mecánico" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Mecánico de prueba" }));
  const hoursInput = screen.getByRole("spinbutton", { name: "Horas" });
  fireEvent.change(hoursInput, { target: { value: hours } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" }), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Notas (opcional)" }), { target: { value: "Revisión pendiente" } });

  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

  expect(state.mutate).not.toHaveBeenCalled();
  expect(hoursInput).toHaveFocus();
  expect(hoursInput).toHaveAttribute("aria-invalid", "true");
  expect(hoursInput).toHaveAccessibleDescription("Ingresa más de 0 horas");
  expect(screen.getByRole("combobox", { name: "Mecánico" })).toHaveTextContent("Mecánico de prueba");
  expect(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" })).toHaveValue(0);
  expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveValue("Revisión pendiente");
  expect(onDraftChange).toHaveBeenLastCalledWith({ dirty: true, pending: false });
});

it("clears the hours error after correction, accepts a zero rate and resets only after saving succeeds", async () => {
  state.error = false;
  state.mechanics = [{ id: "mechanic-a", name: "Mecánico de prueba" }];
  const onDraftChange = vi.fn();
  render(<MaintenanceLaborSection maintenanceLogId="ot-a" onDraftChange={onDraftChange} />);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Mecánico" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Mecánico de prueba" }));
  const hoursInput = screen.getByRole("spinbutton", { name: "Horas" });
  fireEvent.change(hoursInput, { target: { value: "0" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" }), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Notas (opcional)" }), { target: { value: "  Revisión  " } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

  fireEvent.change(hoursInput, { target: { value: "-1" } });
  expect(hoursInput).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(hoursInput, { target: { value: "2" } });
  expect(hoursInput).not.toHaveAttribute("aria-invalid");
  expect(hoursInput).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByText("Ingresa más de 0 horas")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({
    maintenance_log_id: "ot-a", mechanic_id: "mechanic-a", hours: 2, hourly_rate: 0, notes: "Revisión",
  }, expect.any(Object));
  expect(hoursInput).toHaveValue(2);
  expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveValue("  Revisión  ");
  expect(onDraftChange).toHaveBeenLastCalledWith({ dirty: true, pending: false });

  const callbacks = state.mutate.mock.calls[0][1] as { onSuccess: () => void };
  act(() => callbacks.onSuccess());
  expect(hoursInput).toHaveValue(null);
  expect(hoursInput).not.toHaveAttribute("aria-invalid");
  expect(hoursInput).not.toHaveAttribute("aria-describedby");
  expect(screen.getByRole("combobox", { name: "Mecánico" })).toHaveTextContent("Mecánico");
  expect(screen.getByRole("spinbutton", { name: "Tarifa por hora (MXN)" })).toHaveValue(null);
  expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveValue("");
  expect(onDraftChange).toHaveBeenLastCalledWith({ dirty: false, pending: false });
});
