import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMaintenanceForm } from "../../../hooks/maintenance/useMaintenanceForm";
import { MaintenanceFormDialog } from "../MaintenanceFormDialog";

const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
const clock = vi.hoisted(() => ({ now: new Date(2026, 9, 20, 12).getTime() }));
vi.mock("../../../hooks/maintenance/useMaintenanceLogs", () => ({
  useCreateMaintenanceLog: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateMaintenanceLog: () => ({ mutate: mutations.update, isPending: false }),
}));
vi.mock("@/features/suppliers", () => ({ useSuppliers: () => ({ data: [], isLoading: false }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyValidation: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/utils")>(), nowMty: () => new Date(clock.now),
}));

function Harness({ preset = true, edit = false }: { preset?: boolean; edit?: boolean }) {
  const state = useMaintenanceForm(new Map());
  return <><button onClick={() => {
    if (edit) state.openEdit({ id: "qa-existing-maintenance", forklift_id: "qa-forklift", service_type: "Preventivo", performed_at: "2026-10-15", next_service_date: "2026-11-20", work_status: "pending", deleted_at: null } as Parameters<typeof state.openEdit>[0]);
    else state.openCreate();
    state.form.setValue("forkliftId", "qa-forklift");
    state.form.setValue("serviceType", "Preventivo");
    if (preset) {
      state.form.setValue("performedAt", new Date(2026, 9, 15));
      state.form.setValue("nextServiceDate", new Date(2026, 10, 20));
    }
  }}>Abrir QA</button><output data-testid="submit-count">{state.form.formState.submitCount}</output><MaintenanceFormDialog open={state.dialogOpen} onOpenChange={state.setDialogOpen} isEdit={edit} isPending={state.isPending} form={state.form} onSubmit={state.handleSubmit} forklifts={[{ id: "qa-forklift", name: "QA", model: "QA" }]} mechanics={[]} /></>;
}
beforeEach(() => { vi.clearAllMocks(); clock.now = new Date(2026, 9, 20, 12).getTime(); });

describe("UX04: validación de captura llega al formulario", () => {
  it.each(["31/02/2027", "21/11"])("fecha opcional inválida %s no borra el próximo servicio", async (text) => {
    render(<Harness edit />); fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByLabelText("Próximo Servicio");
    expect(input).toHaveValue("20/11/2026");
    fireEvent.change(input, { target: { value: text } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByTestId("submit-count")).toHaveTextContent("1"));
    expect(mutations.update).not.toHaveBeenCalled();
    expect(input).toHaveValue(text);

    fireEvent.change(input, { target: { value: "21/11/2026" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mutations.update).toHaveBeenCalledOnce());
    expect(mutations.update.mock.calls[0][0]).toMatchObject({ id: "qa-existing-maintenance", next_service_date: "2026-11-21" });
  });
  it("fecha requerida parcial enviada sin blur bloquea el envío de la fecha anterior", async () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByRole("textbox", { name: "Fecha de Servicio" });
    expect(input).toHaveValue("15/10/2026");
    fireEvent.change(input, { target: { value: "16/10" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByTestId("submit-count")).toHaveTextContent("1"));
    expect(mutations.create).not.toHaveBeenCalled();
    expect(input).toHaveValue("16/10");
  });
  it("control: fecha opcional completa válida sí llega intacta al payload", async () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByLabelText("Próximo Servicio");
    fireEvent.change(input, { target: { value: "21/11/2026" } }); fireEvent.blur(input);
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mutations.create).toHaveBeenCalledOnce());
    expect(mutations.create.mock.calls[0][0].next_service_date).toBe("2026-11-21");
  });
  it("control: fecha requerida imposible completa sí bloquea el submit", async () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByRole("textbox", { name: "Fecha de Servicio" });
    fireEvent.change(input, { target: { value: "31/02/2027" } }); fireEvent.blur(input);
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByTestId("submit-count")).toHaveTextContent("1"));
    expect(screen.getByText("31/02/2027 no existe")).toBeVisible();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});

describe("Fechas opcionales: vaciado explícito", () => {
  it("permite borrar la fecha opcional después de una captura inválida", async () => {
    render(<Harness edit />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByLabelText("Próximo Servicio");
    fireEvent.change(input, { target: { value: "31/02/2027" } });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mutations.update).toHaveBeenCalledOnce());
    expect(mutations.update.mock.calls[0][0]).toMatchObject({ next_service_date: null });
    expect(input).toHaveValue("");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("UX05: default de mantenimiento calculado al abrir", () => {
  it("abrir Nuevo después de cambiar de día usa el día vigente sin remontar el hook", async () => {
    render(<Harness preset={false} />);
    clock.now = new Date(2026, 9, 21, 12).getTime();
    fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    const input = screen.getByRole("textbox", { name: "Fecha de Servicio" });
    expect(input).toHaveValue("21/10/2026");
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mutations.create).toHaveBeenCalledOnce());
    expect(mutations.create.mock.calls[0][0].performed_at).toBe("2026-10-21");
  });
  it("reabrir después de cancelar recalcula hoy en el mismo hook", () => {
    render(<Harness preset={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    expect(screen.getByRole("textbox", { name: "Fecha de Servicio" })).toHaveValue("20/10/2026");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    clock.now = new Date(2026, 9, 21, 12).getTime();
    fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    expect(screen.getByRole("textbox", { name: "Fecha de Servicio" })).toHaveValue("21/10/2026");
  });
  it("control: abrir en el día de carga sí tiene el día vigente", () => {
    render(<Harness preset={false} />); fireEvent.click(screen.getByRole("button", { name: "Abrir QA" }));
    expect(screen.getByRole("textbox", { name: "Fecha de Servicio" })).toHaveValue("20/10/2026");
  });
});
