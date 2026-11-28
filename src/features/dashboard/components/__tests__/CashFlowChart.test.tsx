import { render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CashFlowChart } from "../CashFlowChart";

const sample = vi.hoisted(() => ({ month: "Oct", invoiced: 10_000, paid: 2_000 }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
  Tooltip: ({ content }: { content: ReactElement }) => cloneElement(content, { active: true, payload: [{ payload: sample }] } as object),
}));

describe("Facturación y cobros", () => {
  it("una diferencia por falta de cobros no se describe como flujo positivo", () => {
    render(<CashFlowChart data={[sample]} />);
    expect(screen.getByText("Facturación y cobros")).toBeInTheDocument();
    expect(screen.getByText("$8,000.00")).toBeInTheDocument();
    expect(screen.getByText("Facturado − cobrado:")).toBeInTheDocument();
    expect(screen.getByText("Los cobros pueden corresponder a facturas de otros meses.")).toBeInTheDocument();
    expect(screen.queryByText(/Flujo positivo|Flujo negativo|Neto:/)).not.toBeInTheDocument();
  });
});
