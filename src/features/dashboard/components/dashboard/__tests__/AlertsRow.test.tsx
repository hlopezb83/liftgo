import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@/hooks/useNavigateTransition", () => ({
  useNavigateTransition: () => navigate,
}));

import { AlertsRow } from "../AlertsRow";

describe("AlertsRow — cobranza", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envía al flujo de pago y no ofrece mutar la factura a paid", () => {
    render(
      <AlertsRow
        overdueInvoices={[{
          id: "inv-1",
          invoice_number: "FAC-001",
          customer_name: "ACME",
          total: 1_000,
          due_date: "2026-09-01",
        }]}
        maintenanceAlerts={[]}
        agingBuckets={[]}
        overdueBookings={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Marcar pagada" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(navigate).toHaveBeenCalledWith("/invoices/inv-1");
  });

  it("muestra el saldo pendiente en MXN de una factura parcialmente pagada", () => {
    render(
      <AlertsRow
        overdueInvoices={[{
          id: "inv-2",
          invoice_number: "FAC-002",
          customer_name: "ACME",
          total: 1_000,
          balance: 400,
          balance_mxn: 400,
          due_date: "2026-09-01",
        }]}
        maintenanceAlerts={[]}
        agingBuckets={[]}
        overdueBookings={[]}
      />,
    );

    expect(screen.getByText("$400.00")).toBeInTheDocument();
    expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
  });

  it("cae al total cuando el fixture legacy no trae saldo", () => {
    render(
      <AlertsRow
        overdueInvoices={[{
          id: "inv-3",
          invoice_number: "FAC-003",
          customer_name: "ACME",
          total: 1_000,
          due_date: "2026-09-01",
        }]}
        maintenanceAlerts={[]}
        agingBuckets={[]}
        overdueBookings={[]}
      />,
    );

    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });
});
