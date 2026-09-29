import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssignForkliftsCard } from "../AssignForkliftsCard";

const h = vi.hoisted(() => ({
  allForklifts: [
    {
      id: "future-reserved",
      status: "available",
      manufacturer: "Toyota",
      model: "8FG",
      name: "Unidad reservada",
      serial_number: "R-1",
    },
    {
      id: "sale-eligible",
      status: "available",
      manufacturer: "Toyota",
      model: "8FG",
      name: "Unidad vendible",
      serial_number: "V-1",
    },
  ],
  saleCandidates: [
    {
      id: "sale-eligible",
      status: "available",
      manufacturer: "Toyota",
      model: "8FG",
      name: "Unidad vendible",
      serial_number: "V-1",
    },
  ],
}));

vi.mock("@/features/fleet", () => ({
  useForklifts: () => ({ data: h.allForklifts, isLoading: false }),
  useSaleAvailableForklifts: () => ({ data: h.saleCandidates, isLoading: false }),
  useQuoteAssignments: () => ({ data: [], isLoading: false }),
  useAssignForklift: () => ({ mutate: vi.fn(), isPending: false }),
  useUnassignForklift: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../AssignForkliftsLineRow", () => ({
  AssignForkliftsLineRow: ({ available, description }: { available: Array<{ id: string }>; description: string }) => (
    <div data-testid="sale-candidates" data-description={description}>{available.map(({ id }) => id).join(",")}</div>
  ),
}));

describe("AssignForkliftsCard", () => {
  it("no ofrece una unidad available que la fuente de venta excluye por reserva futura", () => {
    render(
      <AssignForkliftsCard
        quoteId="q-sale"
        lineItems={[
          {
            description: "Toyota 8FG renta mensual",
            quantity: 3,
            unit_price: 100,
            total: 300,
          },
          {
            description: "Toyota 8FG - Venta de equipo",
            quantity: 1,
            unit_price: 100,
            total: 100,
          },
        ]}
      />,
    );

    const rows = screen.getAllByTestId("sale-candidates");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-description", "Toyota 8FG - Venta de equipo");
    const candidates = rows[0];
    expect(candidates).toHaveTextContent("sale-eligible");
    expect(candidates).not.toHaveTextContent("future-reserved");
  });
});
