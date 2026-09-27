import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useForm, useWatch } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { useInvoiceFormTotals } from "../../../hooks/invoiceForm/useInvoiceFormTotals";
import { buildEmptyInvoiceValues, type InvoiceFormValues, type LineItemValues } from "../../../lib/invoiceFormSchema";
import { EditableLineItemsTable } from "../EditableLineItemsTable";

afterEach(cleanup);

const quotedLines: LineItemValues[] = [
  { description: "LIFT GO FD50 — Renta semanal", quantity: 1, unit_price: 4250.25,
    total: 4250.25, discount: 425.03, discount_type: "$", objeto_imp: "02" },
  { description: "LIFT GO FD50 — Renta diaria", quantity: 1, unit_price: 750.50,
    total: 750.50, discount: 75.05, discount_type: "$", objeto_imp: "02" },
];

function Harness({ lines = quotedLines, currency = "MXN" }: { lines?: LineItemValues[]; currency?: string }) {
  const form = useForm<InvoiceFormValues>({
    defaultValues: { ...buildEmptyInvoiceValues(), lineItems: lines,
      cfdi: { ...buildEmptyInvoiceValues().cfdi, moneda: currency } },
  });
  const totals = useInvoiceFormTotals(form);
  const stored = useWatch({ control: form.control, name: "lineItems" });
  return (
    <Form {...form}>
      <EditableLineItemsTable />
      <button onClick={() => form.setValue("cfdi.moneda", "MXN")}>Cambiar a pesos</button>
      <button onClick={() => form.setValue("cfdi.moneda", "USD")}>Cambiar a dólares</button>
      <output aria-label="Totales contables">{JSON.stringify(totals)}</output>
      <output aria-label="Partidas conservadas">{JSON.stringify(stored)}</output>
    </Form>
  );
}

describe("EditableLineItemsTable — descuentos visibles", () => {
  it("tolera la moneda vacía durante carga y después muestra USD sin tocar los importes", () => {
    render(<Harness currency="" lines={[
      { description: "Renta diaria", quantity: 3, unit_price: 400, total: 1200 },
    ]} />);
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent("—");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a dólares" }));
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent(/(?:US\$|USD\s+)1,200\.00/);
    expect(JSON.parse(screen.getByLabelText("Totales contables").textContent ?? "{}"))
      .toEqual({ subtotal: 1200, taxAmount: 192, total: 1392 });
  });

  it("cambiar la moneda actualiza neto y descuento fijo sin alterar los montos", () => {
    render(<Harness currency="USD" lines={[
      { description: "Renta diaria", quantity: 3, unit_price: 400, total: 1200, discount: 100, discount_type: "$" },
    ]} />);
    expect(screen.getByText(/-(?:US\$|USD\s+)100\.00/)).toBeInTheDocument();
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent(/(?:US\$|USD\s+)1,100\.00/);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a pesos" }));
    expect(screen.getByText("-$100.00")).toBeInTheDocument();
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent("$1,100.00");
    expect(JSON.parse(screen.getByLabelText("Totales contables").textContent ?? "{}"))
      .toEqual({ subtotal: 1100, taxAmount: 176, total: 1276 });
  });

  it("RSV-0006 muestra descuentos y netos que suman el subtotal real", () => {
    render(<Harness />);
    expect(screen.getByRole("columnheader", { name: "Descuento" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Importe neto" })).toBeInTheDocument();
    expect(screen.getByText("-$425.03")).toBeInTheDocument();
    expect(screen.getByText("-$75.05")).toBeInTheDocument();
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent("$3,825.22");
    expect(screen.getByLabelText("Importe neto partida 2")).toHaveTextContent("$675.45");
    expect(JSON.parse(screen.getByLabelText("Totales contables").textContent ?? "{}"))
      .toEqual({ subtotal: 4500.67, taxAmount: 720.11, total: 5220.78 });
    expect(JSON.parse(screen.getByLabelText("Partidas conservadas").textContent ?? "[]"))
      .toEqual(quotedLines);
  });

  it("editar cantidad y precio recalcula bruto/neto sin borrar ni aplicar doble descuento", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Cantidad partida 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Precio unitario partida 1"), { target: { value: "1000.25" } });
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent("$1,575.47");
    const lines = JSON.parse(screen.getByLabelText("Partidas conservadas").textContent ?? "[]");
    expect(lines[0]).toMatchObject({ quantity: 2, unit_price: 1000.25, total: 2000.50,
      discount: 425.03, discount_type: "$" });
    expect(JSON.parse(screen.getByLabelText("Totales contables").textContent ?? "{}"))
      .toEqual({ subtotal: 2250.92, taxAmount: 360.15, total: 2611.07 });
  });

  it("también muestra porcentaje y respeta el límite canónico de neto cero", () => {
    render(<Harness lines={[
      { description: "Porcentaje", quantity: 3, unit_price: 0.01, total: 0.03, discount: 50, discount_type: "%" },
      { description: "Fijo mayor", quantity: 1, unit_price: 100, total: 100, discount: 150, discount_type: "$" },
      { description: "Sin descuento", quantity: 1, unit_price: 10, total: 10 },
    ]} />);
    expect(screen.getByText("-50%")).toBeInTheDocument();
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent("$0.01");
    expect(screen.getByLabelText("Importe neto partida 2")).toHaveTextContent("$0.00");
    expect(within(screen.getAllByRole("row")[3]).getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText("Importe neto partida 3")).toHaveTextContent("$10.00");
  });
});
