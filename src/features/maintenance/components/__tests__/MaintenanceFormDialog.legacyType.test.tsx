import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SERVICE_TYPES } from "@/lib/constants";
import { useMaintenanceForm } from "../../hooks/useMaintenanceForm";
import { MaintenanceFormDialog } from "../MaintenanceFormDialog";

const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../hooks/useMaintenanceLogs", () => ({
  useCreateMaintenanceLog: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateMaintenanceLog: () => ({ mutate: mutations.update, isPending: false }),
}));
vi.mock("@/features/suppliers/hooks/useSuppliers", () => ({ useSuppliers: () => ({ data: [], isLoading: false }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyValidation: vi.fn() }));

function Harness({ serviceType = "inspeccion" }: { serviceType?: string }) {
  const state = useMaintenanceForm(new Map());
  return <>
    <button onClick={() => state.openEdit({
      id: "qa-maintenance", forklift_id: "qa-forklift", service_type: serviceType,
      performed_at: "2026-11-01", description: "Descripción original", manual_cost: 0,
      work_status: "pending", deleted_at: null,
    } as Parameters<typeof state.openEdit>[0])}>Editar servicio de prueba</button>
    <button onClick={state.openCreate}>Crear servicio de prueba</button>
    <MaintenanceFormDialog open={state.dialogOpen} onOpenChange={state.setDialogOpen}
      isEdit={!!state.editingLogId} isPending={state.isPending} form={state.form}
      onSubmit={state.handleSubmit} forklifts={[{ id: "qa-forklift", name: "QA Equipo", model: "QA" }]} mechanics={[]} />
  </>;
}

function openTypes() {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Tipo de Servicio" }), { key: "ArrowDown" });
}
beforeEach(() => vi.clearAllMocks());

it.each([
  ["inspeccion", "Inspección"],
  ["preventivo", "Preventivo"],
  ["correctivo", "Correctivo"],
  ["Servicio especial anterior", "Servicio especial anterior"],
])("shows stored type %s and preserves its value when editing another field", async (value, label) => {
  render(<Harness serviceType={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar servicio de prueba" }));
  expect(await screen.findByRole("combobox", { name: "Tipo de Servicio" })).toHaveTextContent(label);
  const description = screen.getByLabelText("Descripción");
  fireEvent.change(description, { target: { value: "Descripción corregida" } });
  fireEvent.submit(description.closest("form")!);
  await waitFor(() => expect(mutations.update).toHaveBeenCalledOnce());
  expect(mutations.update.mock.calls[0][0]).toMatchObject({
    id: "qa-maintenance", service_type: value, description: "Descripción corregida",
  });
  expect(mutations.create).not.toHaveBeenCalled();
});

it("retains the original historical choice after selecting a current type and lets the user return to it", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Editar servicio de prueba" }));
  openTypes();
  fireEvent.click(await screen.findByRole("option", { name: "Cambio de Aceite" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Tipo de Servicio" })).toHaveTextContent("Cambio de Aceite"));
  openTypes();
  fireEvent.click(await screen.findByRole("option", { name: "Inspección" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Tipo de Servicio" })).toHaveTextContent("Inspección"));
  fireEvent.submit(screen.getByLabelText("Descripción").closest("form")!);
  await waitFor(() => expect(mutations.update).toHaveBeenCalledOnce());
  expect(mutations.update.mock.calls[0][0].service_type).toBe("inspeccion");
});

it("resets the historical option for the next record and leaves creation limited to current types", async () => {
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Editar servicio de prueba" }));
  expect(screen.getByRole("combobox", { name: "Tipo de Servicio" })).toHaveTextContent("Inspección");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  view.rerender(<Harness serviceType="Cambio de Aceite" />);
  fireEvent.click(screen.getByRole("button", { name: "Editar servicio de prueba" }));
  openTypes();
  expect(await screen.findAllByRole("option", { name: "Cambio de Aceite" })).toHaveLength(1);
  expect(screen.queryByRole("option", { name: "Inspección" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Cambio de Aceite" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Crear servicio de prueba" }));
  expect(screen.getByRole("combobox", { name: "Tipo de Servicio" })).toHaveTextContent("Seleccionar tipo de servicio");
  openTypes();
  expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual([...SERVICE_TYPES]);
  expect(mutations.create).not.toHaveBeenCalled();
  expect(mutations.update).not.toHaveBeenCalled();
});
