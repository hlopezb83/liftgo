import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortalInvoices from "./PortalInvoices";

vi.mock("@/features/customers", () => ({
  usePortalInvoices: vi.fn(),
}));

import { usePortalInvoices } from "@/features/customers";

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
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PortalInvoices", () => {
  it("renders QueryErrorState when the invoices query fails (FE2-04)", () => {
    (usePortalInvoices as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderWithRouter(<PortalInvoices />);

    expect(screen.getByText("No se pudo cargar tus facturas")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Revisa tu conexión e inténtalo de nuevo. Los valores en pantalla no son confiables.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("renders the table when invoices load successfully", () => {
    (usePortalInvoices as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        {
          id: "inv-1",
          invoice_number: "FAC-0001",
          issued_at: "2026-07-01",
          due_date: "2026-07-31",
          total: "12000.00",
          moneda: "MXN",
          status: "sent",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithRouter(<PortalInvoices />);

    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("$12,000.00 MXN")).toBeInTheDocument();
  });
});
