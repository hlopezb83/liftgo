import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), refetch: vi.fn() }));
vi.mock("../../../hooks/forklifts/useAvailabilityReasons", () => ({ useAvailabilityReasons: mocks.hook }));
import { ForkliftAvailabilityHelp } from "../ForkliftAvailabilityHelp";

const dates = { from: new Date(2026, 9, 10), to: new Date(2026, 9, 12) };
const unit = { id: "f1", name: "Unidad A", model: "Modelo A", status: "rented" };
const result = {
  allowed: true, isPending: false, isFetching: false, isError: false, refresh: mocks.refetch,
  data: { unavailable: [{ unit, reason: { code: "unknown", label: "Motivo no confirmado", detail: "No hay evidencia suficiente.", nextAction: "Revisa con Operaciones." } }], reservableWhileRented: [], evidenceIncomplete: false },
};
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(result); mocks.refetch.mockReset(); });

function open() {
  render(<ForkliftAvailabilityHelp dateRange={dates} />);
  fireEvent.click(screen.getByRole("button", { name: "¿Por qué no aparecen otros equipos?" }));
}

describe("ForkliftAvailabilityHelp", () => {
  it("is read-only and explains calendar, state, model and admin boundaries", () => {
    open();
    expect(screen.getByText(/Unidad A · Modelo A/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo no confirmado/)).toBeInTheDocument();
    expect(screen.getByText(/Un hueco en el calendario no confirma/)).toBeInTheDocument();
    expect(screen.getByText(/alta de equipos sigue reservada al Administrador/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear|Agregar|Cambiar estado/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar motivos" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it.each(["isPending", "isFetching"])("does not show old reasons while %s", (state) => {
    mocks.hook.mockReturnValue({ ...result, [state]: true });
    open();
    expect(screen.getByRole("status")).toHaveTextContent("Verificando");
    expect(screen.queryByText(/Unidad A ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se encontraron/)).not.toBeInTheDocument();
  });
  it("does not show stale causes or false emptiness after an error", () => {
    mocks.hook.mockReturnValue({ ...result, isError: true });
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron verificar");
    expect(screen.queryByText(/Unidad A ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se encontraron/)).not.toBeInTheDocument();
  });
  it("keeps rentable dates distinct from physical return", () => {
    mocks.hook.mockReturnValue({ ...result, data: { unavailable: [], reservableWhileRented: [unit], evidenceIncomplete: false } });
    open();
    expect(screen.getByText("Reservables para estas fechas, aún con estado Rentado")).toBeInTheDocument();
    expect(screen.getByText(/no acredita una devolución ni autoriza la entrega/)).toBeInTheDocument();
  });
  it("labels partial evidence rather than expose permission-denied details", () => {
    mocks.hook.mockReturnValue({ ...result, data: { ...result.data, evidenceIncomplete: true } });
    open();
    expect(screen.getByRole("status")).toHaveTextContent("Sólo se muestran causas comprobadas");
  });
  it("hides the panel without authorized fleet read", () => {
    mocks.hook.mockReturnValue({ ...result, allowed: false });
    render(<ForkliftAvailabilityHelp dateRange={dates} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
