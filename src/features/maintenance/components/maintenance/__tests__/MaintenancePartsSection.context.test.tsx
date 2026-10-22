import type { ComponentProps } from "react";
import type { AddMaintenancePartForm } from "../AddMaintenancePartForm";
import { it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MaintenancePartsSection } from "@/features/maintenance/components/maintenance/MaintenancePartsSection";
const m = vi.hoisted(() => ({
  parts: [
    {
      id: "part-a",
      name: "Filtro A",
      stock_quantity: 10,
      min_stock_level: 1,
      unit_cost: 100,
    },
  ],
  mutate: vi.fn(),
}));
vi.mock("@/features/inventory", () => ({
  usePartsInventory: () => ({ data: m.parts, isLoading: false }),
  useMaintenanceParts: () => ({ data: [], isLoading: false }),
  useAddMaintenancePart: () => ({ mutate: m.mutate, isPending: false }),
}));
// Replace picker presentation only; parent state and add handler are production code.
vi.mock(
  "@/features/maintenance/components/maintenance/AddMaintenancePartForm",
  () => ({
    AddMaintenancePartForm: (
      p: ComponentProps<typeof AddMaintenancePartForm>,
    ) => (
      <>
        <button onClick={() => p.setSelectedPart(p.availableParts[0])}>
          Elegir refacción
        </button>
        <button onClick={() => p.setQuantity(5)}>Cantidad 5</button>
        <button onClick={p.onAdd}>Agregar</button>
        <output>Cantidad seleccionada: {p.quantity}</output>
        <output>
          Stock candidato: {p.availableParts[0]?.stock_quantity}; stock
          seleccionado: {p.selectedPart?.stock_quantity}
        </output>
      </>
    ),
  }),
);
it("uses current inventory to validate stock and price after refresh", () => {
  const r = render(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  fireEvent.click(screen.getByText("Elegir refacción"));
  fireEvent.click(screen.getByText("Cantidad 5"));
  m.parts = [{ ...m.parts[0], stock_quantity: 2, unit_cost: 150 }];
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  expect(
    screen.getByText("Stock candidato: 2; stock seleccionado: 2"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("Agregar"));
  expect(m.mutate).not.toHaveBeenCalled();
  m.parts = [{ ...m.parts[0], stock_quantity: 8 }];
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  fireEvent.click(screen.getByText("Agregar"));
  expect(m.mutate.mock.calls[0][0]).toEqual({
    maintenance_log_id: "ot-a",
    part_id: "part-a",
    quantity_used: 5,
    cost_at_time: 150,
    currentLogCost: 0,
  });
  m.parts = [{ ...m.parts[0], stock_quantity: 2 }];
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  // Countercheck: reselection adopts newest stock and blocks 5 > 2.
  fireEvent.click(screen.getByText("Elegir refacción"));
  fireEvent.click(screen.getByText("Agregar"));
  expect(m.mutate).toHaveBeenCalledTimes(1);
  const latestPart = m.parts[0];
  m.parts = [];
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  fireEvent.click(screen.getByText("Agregar"));
  expect(m.mutate).toHaveBeenCalledTimes(1);
  m.parts = [latestPart];
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  fireEvent.click(screen.getByText("Elegir refacción"));
  r.rerender(
    <MaintenancePartsSection maintenanceLogId="ot-b" currentCost={0} />,
  );
  expect(
    screen.getByText("Stock candidato: 2; stock seleccionado:"),
  ).toBeInTheDocument();
  expect(screen.getByText("Cantidad seleccionada: 1")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Agregar"));
  expect(m.mutate).toHaveBeenCalledTimes(1);
});
