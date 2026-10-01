import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMaintenanceForm } from "../../../hooks/maintenance/useMaintenanceForm";
import { MaintenanceFormDialog } from "../MaintenanceFormDialog";

const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../../hooks/maintenance/useMaintenanceLogs", () => ({
  useCreateMaintenanceLog: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateMaintenanceLog: () => ({ mutate: mutations.update, isPending: false }),
}));
vi.mock("@/features/suppliers", () => ({ useSuppliers: () => ({ data: [], isLoading: false }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyValidation: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/utils")>(),
  nowMty: () => new Date(2026, 8, 30),
}));

function MaintenanceForm() {
  const state = useMaintenanceForm(new Map());
  return (
    <>
      <button onClick={state.openCreate}>Nuevo mantenimiento</button>
      <MaintenanceFormDialog
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        isEdit={false}
        isPending={state.isPending}
        form={state.form}
        onSubmit={state.handleSubmit}
        forklifts={[]}
        mechanics={[]}
      />
    </>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Mantenimiento: conservar fecha inválida al validar el formulario", () => {
  it.each([false, true])("conserva la captura imposible (fecha previa cambiada: %s)", async (changePrevious) => {
    render(<MaintenanceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo mantenimiento" }));
    const date = await screen.findByLabelText("Fecha de Servicio");
    if (changePrevious) {
      fireEvent.change(date, { target: { value: "15/08/2026" } });
      fireEvent.blur(date);
      expect(date).toHaveValue("15/08/2026");
    }
    fireEvent.change(date, { target: { value: "31/02/2026" } });
    fireEvent.blur(date);
    expect(date).toHaveValue("31/02/2026");
    expect(screen.getAllByText("31/02/2026 no existe")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Agregar registro" }));
    await screen.findByText("Montacargas requerido");
    expect(screen.getByText("Tipo de servicio requerido")).toBeInTheDocument();
    await waitFor(() => expect(date).toHaveValue("31/02/2026"));
    expect(screen.getAllByText("31/02/2026 no existe")).toHaveLength(1);
    expect(screen.queryByText(/Invalid input/)).not.toBeInTheDocument();
    expect(mutations.create).not.toHaveBeenCalled();
    expect(mutations.update).not.toHaveBeenCalled();
  });

  it("conserva vacío el próximo servicio opcional después de borrar una fecha capturada", async () => {
    render(<MaintenanceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo mantenimiento" }));
    const date = await screen.findByLabelText("Próximo Servicio");
    fireEvent.change(date, { target: { value: "20/10/2026" } });
    fireEvent.blur(date);
    expect(date).toHaveValue("20/10/2026");
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.blur(date);
    fireEvent.click(screen.getByRole("button", { name: "Agregar registro" }));
    await screen.findByText("Montacargas requerido");
    expect(date).toHaveValue("");
    expect(date).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/Invalid input/)).not.toBeInTheDocument();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
