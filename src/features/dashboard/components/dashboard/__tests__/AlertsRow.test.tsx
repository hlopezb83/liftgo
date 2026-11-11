import type { ReactNode } from "react";
import { TestRouter } from "@/test/router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@/hooks/useNavigateTransition", () => ({
  useNavigateTransition: () => navigate,
}));

import { AlertsRow } from "../AlertsRow";

async function renderAlerts(content: ReactNode) {
  const view = render(<TestRouter>{content}</TestRouter>);
  await screen.findAllByRole("region");
  return view;
}

describe("AlertsRow — cobranza", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abre el conjunto exacto de transportes atrasados sin prometer disponibilidad del equipo", () => {
    render(<AlertsRow overdueInvoices={[]} maintenanceAlerts={[]} agingBuckets={[]} overdueBookings={[]}
      pendingDeliveriesCount={4} canManageInvoices={false} canManageReturns={false} canManageMaintenance={false} />);
    expect(screen.getByText("Transportes atrasados (4)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver transportes atrasados →" }));
    expect(navigate).toHaveBeenCalledWith("/deliveries?view=overdue");
    expect(screen.queryByText(/siguen apareciendo como disponibles/)).toBeNull();
  });

  it("no muestra una alerta de transportes cuando no hay pendientes", () => {
    render(<AlertsRow overdueInvoices={[]} maintenanceAlerts={[]} agingBuckets={[]} overdueBookings={[]}
      pendingDeliveriesCount={0} canManageInvoices={false} canManageReturns={false} canManageMaintenance={false} />);
    expect(screen.queryByRole("button", { name: "Ver transportes atrasados →" })).toBeNull();
  });

  it("envía al flujo de pago y no ofrece mutar la factura a paid", async () => {
    await renderAlerts(
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
        canManageInvoices
        canManageReturns
        canManageMaintenance
      />,
    );

    expect(screen.queryByRole("button", { name: "Marcar pagada" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver factura" }));
    expect(navigate).toHaveBeenCalledWith("/invoices/inv-1");
  });

  it("muestra el saldo pendiente en MXN de una factura parcialmente pagada", async () => {
    await renderAlerts(
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
        canManageInvoices
        canManageReturns
        canManageMaintenance
      />,
    );

    expect(screen.getByText("$400.00")).toBeInTheDocument();
    expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
  });

  it("cae al total cuando el fixture legacy no trae saldo", async () => {
    await renderAlerts(
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
        canManageInvoices
        canManageReturns
        canManageMaintenance
      />,
    );

    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("con permisos de lectura muestra alertas sin ofrecer acciones de escritura", async () => {
    await renderAlerts(<AlertsRow
      overdueInvoices={[{
        id: "inv-read", invoice_number: "FAC-004", customer_name: "Cliente",
        total: 100, due_date: "2026-09-01",
      }]}
      maintenanceAlerts={[{ forkliftName: "Unidad 1", forkliftId: "fork-1", nextDate: "2026-09-01" }]}
      agingBuckets={[]}
      overdueBookings={[{
        booking_id: "booking-1", forklift_name: "Unidad 2", forklift_id: "fork-2",
        customer_name: "Cliente", end_date: "2026-09-01", days_overdue: 2,
      }]}
      canManageInvoices={false}
      canManageReturns={false}
      canManageMaintenance={false}
    />);

    expect(screen.queryByRole("button", { name: "Ver factura" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar devolución" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar servicio" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Unidad 2/ })).toHaveAttribute("href", "/bookings/booking-1");
  });

  it("Enter sobre la acción de servicio no abre además la ficha de flota", async () => {
    await renderAlerts(<AlertsRow
      overdueInvoices={[]}
      maintenanceAlerts={[{ forkliftName: "Unidad 1", forkliftId: "fork-1", nextDate: "2026-09-01" }]}
      agingBuckets={[]}
      overdueBookings={[]}
      canManageInvoices={false}
      canManageReturns={false}
      canManageMaintenance
    />);

    const action = screen.getByRole("button", { name: "Registrar servicio" });
    expect(action.closest("a, [role=button]")).toBeNull();
    expect(screen.getByRole("link", { name: /Unidad 1/ })).toHaveAttribute("href", "/fleet/fork-1");
    fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.click(action);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/maintenance");
  });
});
