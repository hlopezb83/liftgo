import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortalInvoices from "./PortalInvoices";

vi.mock("@/features/customers", () => ({
  usePortalInvoicesPage: vi.fn(),
}));

import { usePortalInvoicesPage } from "@/features/customers";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>,
  );
}

describe("PortalInvoices", () => {
  it("renders QueryErrorState when the invoices query fails (FE2-04)", async () => {
    (usePortalInvoicesPage as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderWithRouter(<PortalInvoices />);

    expect(await screen.findByText("No se pudo cargar tus facturas")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Revisa tu conexión e inténtalo de nuevo. Los valores en pantalla no son confiables.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("renders the table when invoices load successfully", async () => {
    (usePortalInvoicesPage as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        rows: [{
          id: "inv-1",
          invoice_number: "FAC-0001",
          issued_at: "2026-07-01",
          due_date: "2026-07-31",
          total: "12000.00",
          moneda: "MXN",
          status: "sent",
        }],
        totalCount: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithRouter(<PortalInvoices />);

    expect(await screen.findByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("$12,000.00")).toBeInTheDocument();
  });
});
