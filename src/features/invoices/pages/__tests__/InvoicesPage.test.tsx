import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as hooks from "../../hooks/invoices/useInvoices";
import InvoicesPage from "../InvoicesPage";

const mockInvoices = [
  {
    id: "inv-1",
    invoice_number: "FAC-0001",
    customer_name: "Matrimar",
    total: 1700,
    status: "sent",
    issued_at: "2026-02-13",
    due_date: "2026-02-13",
  },
  {
    id: "inv-2",
    invoice_number: "FAC-0002",
    customer_name: "Matrimar",
    total: 2000,
    status: "paid",
    issued_at: "2026-02-13",
    due_date: "2026-02-20",
  },
];

vi.mock("../../hooks/invoices/useInvoices", () => ({
  useInvoices: vi.fn(() => ({ data: mockInvoices, isLoading: false })),
}));

vi.mock("../../hooks/invoices/recurring/useGenerateRecurringInvoices", () => ({
  useGenerateRecurringInvoices: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <InvoicesPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
  return container;
}

describe("InvoicesPage smoke tests", () => {
  beforeEach(() => {
    vi.mocked(hooks.useInvoices).mockReturnValue({ data: mockInvoices, isLoading: false } as ReturnType<typeof hooks.useInvoices>);
  });

  it("renders all invoices with correct statuses", () => {
    const container = renderPage();
    expect(container.textContent).toContain("FAC-0001");
    expect(container.textContent).toContain("FAC-0002");
    expect(container.textContent).toContain("Sin Pagar");
    expect(container.textContent).toContain("Pagado");
  });

  it("paid status persists and is displayed correctly", () => {
    const container = renderPage();
    const rows = container.querySelectorAll("tbody tr") as NodeListOf<HTMLElement>;
    const paidRow = Array.from(rows).find((r) => r.textContent?.includes("FAC-0002"));
    expect(paidRow).toBeTruthy();
    expect(paidRow?.textContent).toContain("Pagado");
    expect(paidRow?.textContent).toMatch(/2,000\.00/);
  });

  it("displays correct totals", () => {
    const container = renderPage();
    expect(container.textContent).toMatch(/1,700\.00/);
    expect(container.textContent).toMatch(/2,000\.00/);
  });

  it("shows empty state when no invoices match", () => {
    vi.mocked(hooks.useInvoices).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof hooks.useInvoices>);
    const container = renderPage();
    expect(container.textContent).toContain("No se encontraron facturas");
  });
});
