import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { CloseWorkOrderDialog } from "../CloseWorkOrderDialog";

const closeMutate = vi.fn();
let openDamage: { id: string; description: string; status: string } | null = null;

// R8-FE-03 (BL-R8-07): el submit de "Cerrar OT" debe bloquearse en el FE
// mientras exista un daño abierto ligado a la OT, sin depender del error
// del trigger server-side (R8-DB-02).
vi.mock("../../../hooks/maintenance/useWorkOrderClose", () => ({
  useCloseWorkOrder: () => ({ mutate: closeMutate, isPending: false }),
  useOpenDamageForLog: () => ({ data: openDamage }),
}));

vi.mock("../WorkOrderCloseSummary", () => ({
  WorkOrderCloseSummary: () => <div data-testid="close-summary" />,
}));

const baseLog = {
  id: "log-1",
  service_type: "Mantenimiento",
  forklift_name: "Toyota 1",
  description: null,
  manual_cost: 0,
} as unknown as Parameters<typeof CloseWorkOrderDialog>[0]["log"];

function renderDialog() {
  const onOpenChange = vi.fn();
  const { queryClient } = createQueryWrapper();
  render(
    <QueryClientProvider client={queryClient}>
      <CloseWorkOrderDialog open onOpenChange={onOpenChange} log={baseLog} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("CloseWorkOrderDialog — bloqueo de cierre con daño abierto (R8-FE-03)", () => {
  it("deshabilita el botón 'Cerrar OT' cuando hay un daño abierto y muestra la razón", () => {
    openDamage = { id: "d1", description: "Llanta ponchada", status: "reported" };
    renderDialog();

    const submit = screen.getByRole("button", { name: /cerrar ot/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/no se puede cerrar: hay un daño abierto ligado a esta ot/i),
    ).toBeInTheDocument();
  });

  it("no invoca la mutación de cierre aunque se intente enviar el form con daño abierto", () => {
    openDamage = { id: "d1", description: "Llanta ponchada", status: "reported" };
    renderDialog();

    const submit = screen.getByRole("button", { name: /cerrar ot/i });
    fireEvent.click(submit);
    expect(closeMutate).not.toHaveBeenCalled();
  });

  it("habilita el botón cuando no hay daño abierto", () => {
    openDamage = null;
    renderDialog();

    const submit = screen.getByRole("button", { name: /cerrar ot/i });
    expect(submit).not.toBeDisabled();
  });
});
