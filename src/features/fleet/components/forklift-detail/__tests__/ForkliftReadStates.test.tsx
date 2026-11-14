import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ForkliftFinancialCard } from "../ForkliftFinancialCard";
import { ForkliftMaintenanceList } from "../ForkliftMaintenanceList";
import type { ForkliftFinancials } from "../../../hooks/forklifts/useForkliftFinancials";
import type { Tables } from "@/integrations/supabase/types";

const financials = { revenue: 1000, maintenance_cost: 100, gross_margin: 900, roi_percent: 9, days_rented: 10, utilization_percent: 20 } as ForkliftFinancials;
const log = { id: "ot-a", service_type: "Preventivo QA", performed_at: "2026-11-14", cost: 100 } as Tables<"maintenance_logs">;
const ready = { isLoading: false, isError: false, isSuccess: true, isFetching: false, onRetry: vi.fn() };

it("keeps maintenance errors distinct from loading and empty, with retry and cached rows", () => {
  const retry = vi.fn();
  const props = { ...ready, logs: undefined, onRetry: retry };
  const view = render(<ForkliftMaintenanceList {...props} isSuccess={false} isLoading />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando historial");
  expect(screen.queryByText("Sin registros de mantenimiento")).not.toBeInTheDocument();
  view.rerender(<ForkliftMaintenanceList {...props} isSuccess={false} isError />);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByText("Sin registros de mantenimiento")).not.toBeInTheDocument();
  view.rerender(<ForkliftMaintenanceList {...props} logs={[log]} isSuccess={false} isError isFetching />);
  expect(screen.getByText("Preventivo QA")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled();
  view.rerender(<ForkliftMaintenanceList {...props} logs={[]} />);
  expect(screen.getByText("Sin registros de mantenimiento")).toBeInTheDocument();
});

it("retains the financial section and cached metrics while an authorized reader retries", () => {
  const retry = vi.fn();
  const props = { ...ready, financials: undefined, onRetry: retry };
  const view = render(<ForkliftFinancialCard {...props} isSuccess={false} isLoading />);
  expect(screen.getByRole("status", { name: "Cargando resumen financiero" })).toBeInTheDocument();
  view.rerender(<ForkliftFinancialCard {...props} isSuccess={false} isError />);
  expect(screen.getByText("Resumen Financiero")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledOnce();
  view.rerender(<ForkliftFinancialCard {...props} financials={financials} isSuccess={false} isError isFetching />);
  expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled();
  view.rerender(<ForkliftFinancialCard {...props} />);
  expect(screen.getByText("Sin información financiera disponible.")).toBeInTheDocument();
});
