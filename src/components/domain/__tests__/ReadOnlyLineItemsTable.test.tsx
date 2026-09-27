import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReadOnlyLineItemsTable } from "../ReadOnlyLineItemsTable";

afterEach(cleanup);

describe("ReadOnlyLineItemsTable — neto de factura", () => {
  it("una factura USD identifica precio, descuento fijo y neto en dólares", () => {
    render(<ReadOnlyLineItemsTable currency="USD" lineItems={[
      { description: "Renta diaria", quantity: 3, unit_price: 400, total: 1200, discount: 100, discount_type: "$" },
    ]} />);
    expect(screen.getByText(/(?:US\$|USD\s+)400\.00/)).toBeInTheDocument();
    expect(screen.getByText(/-(?:US\$|USD\s+)100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/(?:US\$|USD\s+)1,100\.00/)).toBeInTheDocument();
  });

  it("separa descuento y neto en el detalle sin volver a descontar el precio", () => {
    render(<ReadOnlyLineItemsTable lineItems={[
      { description: "Semanal", quantity: 1, unit_price: 4250.25, total: 4250.25, discount: 425.03, discount_type: "$" },
      { description: "Diaria", quantity: 1, unit_price: 750.50, total: 750.50, discount: 75.05, discount_type: "$" },
    ]} />);
    expect(screen.getByRole("columnheader", { name: "Descuento" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Importe neto" })).toBeInTheDocument();
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByText("$4,250.25")).toBeInTheDocument();
    expect(row.getByText("-$425.03")).toBeInTheDocument();
    expect(row.getByText("$3,825.22")).toBeInTheDocument();
    expect(screen.getByText("$675.45")).toBeInTheDocument();
  });

  it("sin descuento mantiene el total normal", () => {
    render(<ReadOnlyLineItemsTable lineItems={[
      { description: "Servicio", quantity: 2, unit_price: 100, total: 200 },
    ]} />);
    expect(screen.queryByRole("columnheader", { name: "Descuento" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });
});
