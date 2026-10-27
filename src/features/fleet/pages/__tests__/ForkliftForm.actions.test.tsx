import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zodResolver } from "@/lib/forms/zodResolver";
import { forkliftFormSchema, type ForkliftFormData } from "../../lib/forkliftFormSchema";
import ForkliftForm from "../ForkliftForm";

const state = vi.hoisted(() => ({
  edit: false, pending: false, hasModels: true, name: "QA - Equipo de almacén",
  submit: vi.fn(), navigate: vi.fn(),
}));

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("../../hooks/useForkliftFormLogic", () => ({
  useForkliftFormLogic: () => {
    const form = useForm<ForkliftFormData>({
      resolver: zodResolver(forkliftFormSchema),
      defaultValues: {
        name: state.name, manufacturer: "QA - Fabricante de equipos", model: "QA - Modelo de elevación",
        year: "2026", capacity_kg: "2500", mast_height_m: "4", fuel_type: "Diesel",
        serial_number: "QA-SERIE-001", status: "available", daily_rate: "1234",
        weekly_rate: "7654", monthly_rate: "34567", acquisition_cost: "987654",
        insurance_provider: "QA - Aseguradora", insurance_policy_number: "QA-POL-001",
        insurance_expiry: "2027-12-31", insurance_cost: "12345", notes: "",
      },
    });
    return {
      form, isEdit: state.edit, isPending: state.pending, hasModels: state.hasModels,
      navigate: state.navigate, onSubmit: state.submit,
      manufacturers: ["QA - Fabricante de equipos"],
      filteredModels: [{ id: "qa-model", model: "QA - Modelo de elevación" }],
      handleManufacturerChange: vi.fn(), handleModelChange: vi.fn(),
    };
  },
}));

beforeEach(() => {
  state.edit = false; state.pending = false; state.hasModels = true;
  state.name = "QA - Equipo de almacén";
  state.submit.mockReset(); state.navigate.mockReset();
});
afterEach(cleanup);

describe("acciones del formulario de equipos", () => {
  it.each([false, true])("guarda una sola vez los datos originales y notas desde la barra única (edición: %s)", async (edit) => {
    state.edit = edit;
    render(<ForkliftForm />);
    const actions = screen.getByRole("region", { name: "Acciones del equipo" });
    const submit = within(actions).getByRole("button", { name: edit ? "Guardar cambios" : "Agregar montacargas" });
    expect(screen.getAllByRole("button", { name: edit ? "Guardar cambios" : "Agregar montacargas" })).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "QA - Nota completa del equipo" } });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(state.submit).toHaveBeenCalledOnce());
    expect(state.submit.mock.calls[0][0]).toMatchObject({
      name: state.name, manufacturer: "QA - Fabricante de equipos", model: "QA - Modelo de elevación",
      status: "available", daily_rate: "1234", weekly_rate: "7654", monthly_rate: "34567",
      acquisition_cost: "987654", insurance_cost: "12345", notes: "QA - Nota completa del equipo",
    });
  });

  it("mantiene el error requerido y devuelve el foco al campo sin guardar", async () => {
    state.name = "";
    render(<ForkliftForm />);
    fireEvent.click(within(screen.getByRole("region", { name: "Acciones del equipo" })).getByRole("button", { name: "Agregar montacargas" }));
    expect(await screen.findByText("Nombre es requerido")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Nombre \/ ID/ })).toHaveFocus());
    expect(state.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Notas" })).toBeInTheDocument();
  });

  it("bloquea ambas acciones durante el guardado", () => {
    state.pending = true;
    render(<ForkliftForm />);
    const actions = within(screen.getByRole("region", { name: "Acciones del equipo" }));
    expect(actions.getByRole("button", { name: /^Guardando/ })).toBeDisabled();
    expect(actions.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(actions.getByRole("button", { name: "Cancelar" }));
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it("conserva el regreso exacto de Cancelar y Volver", () => {
    render(<ForkliftForm />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(state.navigate.mock.calls).toEqual([[-1], [-1]]);
    expect(state.submit).not.toHaveBeenCalled();
  });

  it("sin catálogo mantiene la salida de configuración y no ofrece guardar", () => {
    state.hasModels = false;
    render(<ForkliftForm />);
    expect(screen.queryByRole("region", { name: "Acciones del equipo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Configuración" }));
    expect(state.navigate).toHaveBeenCalledWith("/settings/operations");
  });
});
