import type { ComponentProps } from "react";
import type { AddMaintenancePartForm } from "../AddMaintenancePartForm";
import { beforeEach, it, expect, vi } from "vitest";
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
  selectedStock: undefined as number | undefined,
  mutate: vi.fn(),
  error: false,
  refetch: vi.fn(),
}));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "org-a:user" }));
vi.mock("../../../hooks/maintenance/useMaintenancePartOptions", () => ({
  MAINTENANCE_PART_PAGE_SIZE: 25,
  useMaintenancePartOptions: ({ selectedId }: { selectedId: string | null }) => {
    const part = m.parts.find(part => part.id === selectedId);
    return {
      pageQuery: { data: { items: m.parts, totalCount: m.parts.length, pageIndex: 0 }, isSuccess: true, isFetching: false, isError: false },
      selectedQuery: { data: part ? { ...part, stock_quantity: m.selectedStock ?? part.stock_quantity } : null, isSuccess: true, isFetching: false, isError: false },
      contextError: false,
    };
  },
}));
vi.mock("@/features/inventory", () => ({
  useMaintenanceParts: () => ({ data: [], isLoading: false, isError: m.error, refetch: m.refetch }),
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
        <label>
          Cantidad
          <input value={p.quantity} onChange={(event) => p.setQuantity(event.target.value)} />
        </label>
        {p.quantityError && <p role="alert">{p.quantityError}</p>}
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
beforeEach(() => { m.error = false; m.selectedStock = undefined; m.mutate.mockClear(); m.refetch.mockClear(); });
it("uses current inventory to validate stock and price after refresh", () => {
  const r = render(
    <MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />,
  );
  fireEvent.click(screen.getByText("Elegir refacción"));
  fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });
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

it("retries failed consumption reads without declaring empty or discarding the capture", () => {
  m.parts = [{ ...m.parts[0], stock_quantity: 8 }];
  const view = render(<MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />);
  fireEvent.click(screen.getByText("Elegir refacción"));
  fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });
  m.error = true;
  view.rerender(<MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />);
  expect(screen.getByText("No se pudo cargar las refacciones utilizadas")).toBeInTheDocument();
  expect(screen.queryByText("No se han agregado refacciones.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  expect(m.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(m.refetch).toHaveBeenCalledOnce();
  m.error = false;
  view.rerender(<MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />);
  expect(screen.getByText("Cantidad seleccionada: 5")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  expect(m.mutate.mock.calls[0][0]).toMatchObject({ part_id: "part-a", quantity_used: 5 });
});

it("keeps invalid quantity text and only submits whole units within confirmed stock", () => {
  m.parts = [{ ...m.parts[0], stock_quantity: 8 }];
  m.selectedStock = 3;
  render(<MaintenancePartsSection maintenanceLogId="ot-a" currentCost={0} />);
  fireEvent.click(screen.getByText("Elegir refacción"));
  const input = screen.getByLabelText("Cantidad");
  const add = screen.getByRole("button", { name: "Agregar" });
  for (const [draft, error] of [
    ["", "Ingresa una cantidad."],
    ["0", "Ingresa un número entero mayor que 0."],
    ["1.5", "Ingresa un número entero mayor que 0."],
    ["1.0000000000000001", "Ingresa un número entero mayor que 0."],
    ["1e1", "Ingresa un número entero mayor que 0."],
    ["4", "El stock disponible es de 3."],
  ]) {
    fireEvent.change(input, { target: { value: draft } });
    expect(input).toHaveValue(draft);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    fireEvent.click(add);
  }
  expect(m.mutate).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "3" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(add);
  expect(m.mutate).toHaveBeenCalledOnce();
  expect(m.mutate.mock.calls[0][0]).toMatchObject({ part_id: "part-a", quantity_used: 3 });
});
