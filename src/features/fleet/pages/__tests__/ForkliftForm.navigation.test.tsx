import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import ForkliftForm from "../ForkliftForm";

const state = vi.hoisted(() => ({
  update: vi.fn(), create: vi.fn(), success: vi.fn(), error: vi.fn(),
  existing: {
    id: "qa-equipment", name: "QA Equipo", manufacturer: "QA", model: "Modelo QA",
    equipment_model_id: "qa-model", serial_number: "QA-001", status: "available",
    fuel_type: "Diesel", daily_rate: 500, weekly_rate: 3000, monthly_rate: 10000,
    updated_at: "2026-01-01T00:00:00Z", notes: "Nota inicial",
  },
  models: [{ id: "qa-model", manufacturer: "QA", model: "Modelo QA" }],
}));

vi.mock("../../hooks/forklifts/useForklifts", () => ({
  useForklift: () => ({ data: state.existing }),
  useForklifts: () => ({ data: [state.existing] }),
  useCreateForklift: () => ({ mutate: state.create, isPending: false }),
  useUpdateForklift: () => ({ mutate: state.update, isPending: false }),
}));
vi.mock("../../hooks/useEquipmentModels", () => ({ useEquipmentModels: () => ({ data: state.models }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success, notifyError: state.error }));

function RouteContent() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="path">{location.pathname}</output>
    <button onClick={() => navigate("/fleet")}>Abrir listado</button>
    {location.pathname.endsWith("/edit") ? <ForkliftForm /> : <p>Ficha del equipo</p>}
  </>;
}

async function setup() {
  render(<TestRouter initialEntries={["/fleet/qa-equipment", "/fleet/qa-equipment/edit"]} path="/fleet/$id/edit">
    <ConfirmProvider><RouteContent /></ConfirmProvider>
  </TestRouter>);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Notas" })).toHaveValue("Nota inicial"));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("salida del editor de equipos", () => {
  // Memory history skips blockers for GO; the browser regression covers Cancelar/Volver.
  it("la navegación interna pide confirmar, conserva los datos al rechazar y sale al aceptar", async () => {
    await setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Captura pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir listado" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("path")).toHaveTextContent("/fleet/qa-equipment/edit");
    expect(screen.getByRole("textbox", { name: "Notas" })).toHaveValue("Captura pendiente");

    fireEvent.click(screen.getByRole("button", { name: "Abrir listado" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(/^\/fleet$/));
    expect(state.update).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("sale sin confirmación cuando no hay cambios", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(/^\/fleet\/qa-equipment$/));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("una respuesta exitosa permite navegar en el mismo turno sin alerta de descarte", async () => {
    await setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Captura guardada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
    expect(state.update.mock.calls[0][0]).toMatchObject({ id: "qa-equipment", notes: "Captura guardada", expectedUpdatedAt: state.existing.updated_at });
    const callbacks = state.update.mock.calls[0][1] as { onSuccess: () => void };
    await act(async () => callbacks.onSuccess());
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(/^\/fleet\/qa-equipment$/));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(state.success).toHaveBeenCalledWith("Montacargas actualizado");
  });

  it("un guardado fallido conserva los cambios y la protección al salir", async () => {
    await setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Captura pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
    const callbacks = state.update.mock.calls[0][1] as { onError: (error: Error) => void };
    await act(async () => callbacks.onError(new Error("Fallo de prueba")));
    expect(screen.getByRole("textbox", { name: "Notas" })).toHaveValue("Captura pendiente");
    fireEvent.click(screen.getByRole("button", { name: "Abrir listado" }));
    expect(await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" })).toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
  });
});
