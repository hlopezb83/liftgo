import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { DashboardAlertsSection } from "../DashboardAlertsSection";

const props = {
  overdueInvoices: [], maintenanceAlerts: [], agingBuckets: [], overdueBookings: [], expiringContracts: [],
  canManageInvoices: false, canManageReturns: false, canManageMaintenance: false,
};

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
