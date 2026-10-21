import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { computeInvoiceCreditBalance } from "../../../lib/invoiceCreditBalance";
import { InvoiceCreditBalanceCard } from "../InvoiceCreditBalanceCard";

const invoice = { id: "i1", invoice_number: "FAC-TRACE-001", total: 100, moneda: "USD", tipo_cambio: 17.5, status: "paid" };
const payment = { id: "p1", invoice_id: "i1", amount: 100, currency: "USD", exchange_rate: 17.6,
  payment_date: "2026-10-20", reference_number: "REF-ORIGIN", rep_cfdi_uuid: "REP-ORIGIN" };
const note = { id: "c1", invoice_id: "i1", credit_note_number: "NC-TRACE-001", total: 25, currency: "USD",
  cfdi_status: "stamped", status: "issued", cancellation_status: "none" };
const balance = () => computeInvoiceCreditBalance(invoice, [payment], [note]);
afterEach(cleanup);

describe("invoice excess evidence card", () => {
  it("shows current excess explicitly without promising an available or applied balance", () => {
    render(<InvoiceCreditBalanceCard balance={balance()} />);
    expect(screen.getByTestId("invoice-excess")).toHaveTextContent(/25\.00/);
    expect(screen.getByText(/no un saldo disponible para aplicar/)).toBeInTheDocument();
    expect(screen.getByText(/no registra nuevos cobros, aplicaciones ni devoluciones/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("traces source documents, original currency and captured FX, with no mutation controls", () => {
    render(<InvoiceCreditBalanceCard balance={balance()} />);
    const details = screen.getByText("Ver documentos y tipos de cambio de origen").closest("details");
    fireEvent.click(screen.getByText("Ver documentos y tipos de cambio de origen"));
    expect(details).toBeInTheDocument();
    expect(screen.getByText(/Factura FAC-TRACE-001 · USD · TC capturado a MXN: 17.5/)).toBeInTheDocument();
    expect(screen.getByLabelText("Pagos de origen")).toHaveTextContent("REF-ORIGIN");
    expect(screen.getByLabelText("Pagos de origen")).toHaveTextContent("17.6");
    expect(screen.getByLabelText("Pagos de origen")).toHaveTextContent("REP-ORIGIN");
    expect(screen.getByLabelText("Notas de crédito vigentes de origen")).toHaveTextContent("NC-TRACE-001");
  });
  it("unknown FX displays an explicit problem, never a zero/partial available balance", () => {
    const unknown = computeInvoiceCreditBalance(invoice, [{ ...payment, currency: "EUR", exchange_rate: null }], [note]);
    render(<InvoiceCreditBalanceCard balance={unknown} />);
    expect(screen.getByRole("status")).toHaveTextContent("No se puede determinar");
    expect(screen.queryByTestId("invoice-excess")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pagos de origen")).toHaveTextContent("no determinable");
  });
  it("does not add a noisy card when there is no excess", () => {
    const noExcess = computeInvoiceCreditBalance(invoice, [], [note]);
    const { container } = render(<InvoiceCreditBalanceCard balance={noExcess} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("removes the current excess after source changes, preserving no stale UI amount", () => {
    const { rerender } = render(<InvoiceCreditBalanceCard balance={balance()} />);
    expect(screen.getByTestId("invoice-excess")).toBeInTheDocument();
    rerender(<InvoiceCreditBalanceCard balance={computeInvoiceCreditBalance(invoice, [payment], [{ ...note, cancellation_status: "accepted" }])} />);
    expect(screen.queryByTestId("invoice-excess")).not.toBeInTheDocument();
  });
});


it("uses the same NULL-active source as the visible invoice detail", () => {
  render(<InvoiceCreditBalanceCard balance={computeInvoiceCreditBalance(invoice, [payment], [{ ...note, cancellation_status: null }])} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByTestId("invoice-excess")).toHaveTextContent("25.00");
});
