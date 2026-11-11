import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { DashboardAlertsSection } from "../DashboardAlertsSection";

const props = {
  overdueInvoices: [], maintenanceAlerts: [], agingBuckets: [], overdueBookings: [], expiringContracts: [],
  canManageInvoices: false, canManageReturns: false, canManageMaintenance: false,
};

it.each(["finance", "operations"] as const)("ordena las alertas por perfil %s sin duplicarlas", async (priority) => {
  render(<TestRouter><DashboardAlertsSection {...props} priority={priority}
    pendingDeliveriesCount={4}
    overdueInvoices={[{ id: "inv1", invoice_number: "FAC-QA", customer_name: "Cliente", total: 100, due_date: "2026-11-01" }]}
    overdueBookings={[{ booking_id: "b1", forklift_name: "Unidad QA-RET", forklift_id: "f1", customer_name: "Cliente", end_date: "2026-11-01", days_overdue: 2 }]}
    collectionForecast={{ status: "hidden" }} insuranceAlert={{ status: "hidden" }} />
  </TestRouter>);
  await screen.findByText("FAC-QA");
  const regions = screen.getAllByRole("region");
  expect(regions).toHaveLength(3);
  if (priority === "finance") expect(regions[0]).toHaveTextContent("FAC-QA");
  else {
    expect(regions[0]).not.toHaveTextContent("FAC-QA");
    expect(regions[1]).toHaveTextContent("Unidad QA-RET");
    expect(regions[2]).toHaveTextContent("FAC-QA");
  }
  expect(screen.getAllByText("FAC-QA")).toHaveLength(1);
});

it("muestra carga y error por alerta, y sólo monta previsiones con datos listos", async () => {
  const onRetry = vi.fn();
  const view = render(
    <TestRouter>
      <DashboardAlertsSection
        {...props}
        collectionForecast={{ status: "loading" }}
        insuranceAlert={{ status: "error", error: new Error("No disponible"), isRetrying: false, onRetry }}
      />
    </TestRouter>,
  );
  expect(await screen.findByText("Cargando la previsión de cobranza…")).toBeInTheDocument();
  expect(screen.queryByText("Próximos 7 días")).not.toBeInTheDocument();
  expect(screen.getByText("No se pudo cargar las alertas de seguros")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(onRetry).toHaveBeenCalledOnce();

  view.unmount();
  render(
    <TestRouter>
      <DashboardAlertsSection
        {...props}
        collectionForecast={{ status: "ready", data: [] }}
        insuranceAlert={{ status: "ready", data: { expiring: [], no_insurance_count: 0 } }}
      />
    </TestRouter>,
  );
  expect(await screen.findByText("Próximos 7 días")).toBeInTheDocument();
  expect(screen.queryByText("No se pudo cargar las alertas de seguros")).not.toBeInTheDocument();
});
