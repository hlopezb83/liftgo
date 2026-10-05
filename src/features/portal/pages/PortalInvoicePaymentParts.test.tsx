import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeInvoiceTotals } from "./PortalInvoicePayment.helpers";
import {
  ForeignCurrencyNotice,
  InvoiceNotFound,
  MxnPaymentSection,
  PaidCard,
  PaymentBody,
  PaymentQueryError,
  PortalIntentsTable,
  type PaymentBodyProps,
} from "./PortalInvoicePaymentParts";

vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

describe("PortalInvoicePaymentParts", () => {
  it("conserva las piezas extraídas que compone la página", () => {
    expect([
      PortalIntentsTable,
      ForeignCurrencyNotice,
      MxnPaymentSection,
      PaidCard,
      PaymentQueryError,
      InvoiceNotFound,
      PaymentBody,
    ]).toEqual(expect.arrayContaining([expect.any(Function)]));
  });

  it("descuenta pagos y notas de crédito cuando no hay saldo canónico", () => {
    expect(computeInvoiceTotals(
      { total: "1500", credited_amount: "200", moneda: "MXN" },
      [{ amount: "400" }],
      [],
    )).toMatchObject({ balance: 900, reportableBalance: 900, pendingReported: 0, moneda: "MXN", isMxn: true });
  });

  it("conserva el saldo canónico y descuenta sólo reportes pendientes del monto reportable", () => {
    expect(computeInvoiceTotals(
      { total: 2000, balance: "1000", moneda: "USD" },
      [{ amount: 800 }],
      [
        { amount: "600", status: "pending_review" },
        { amount: "500", status: "approved" },
        { amount: "700", status: "pending_review" },
      ],
    )).toMatchObject({ balance: 1000, reportableBalance: 0, pendingReported: 1300, moneda: "USD", isMxn: false });
  });

  it("mantiene MXN como moneda predeterminada", () => {
    const result = computeInvoiceTotals({ total: 100 }, [], []);
    expect(result.moneda).toBe("MXN");
    expect(result.isMxn).toBe(true);
  });

  it("una factura cubierta por nota de crédito no se presenta como dinero cobrado", () => {
    render(<PaymentBody
      invoice={{ id: "invoice-credit", invoice_number: "FAC-0001", status: "sent",
        total: 1500, credited_amount: 1500, moneda: "MXN" } as PaymentBodyProps["invoice"]}
      invoicePayments={[]} intents={[]} customer={null} dlgOpen={false} setDlgOpen={vi.fn()}
    />);
    expect(screen.getByText("Esta factura no tiene saldo pendiente.")).toBeInTheDocument();
    expect(screen.queryByText(/ya está pagada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reportar/i })).not.toBeInTheDocument();
  });

  it("muestra al cliente el motivo guardado cuando su reporte fue rechazado", () => {
    render(<PortalIntentsTable intents={[{
      id: "intent-1",
      transfer_date: "2026-09-28",
      amount: 250,
      tracking_key: "ABC123",
      status: "rejected",
      review_notes: "El comprobante no corresponde a esta factura.",
    }]} />);

    expect(screen.getByText("Motivo de rechazo")).toBeInTheDocument();
    expect(screen.getByText("El comprobante no corresponde a esta factura.")).toBeInTheDocument();
  });

});
