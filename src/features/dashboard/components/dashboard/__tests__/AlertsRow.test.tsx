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
});
