import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InvoicesPage from "../InvoicesPage";
import * as hooks from "@/hooks/useInvoices";

const mockInvoices = [
  {
    id: "inv-1",
    invoice_number: "INV-0001",
    customer_name: "Matrimar",
    total: 1700,
    status: "sent",
    issued_at: "2026-02-13",
    due_date: "2026-02-13",
  },
  {
    id: "inv-2",
    invoice_number: "INV-0002",
    customer_name: "Matrimar",
    total: 2000,
    status: "paid",
    issued_at: "2026-02-13",
    due_date: "2026-02-20",
  },
];

vi.mock("@/hooks/useInvoices", () => ({
  useInvoices: vi.fn(() => ({ data: mockInvoices, isLoading: false })),
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
    vi.mocked(hooks.useInvoices).mockReturnValue({ data: mockInvoices, isLoading: false } as any);
  });

  it("renders all invoices with correct statuses", () => {
    const container = renderPage();
    expect(container.textContent).toContain("INV-0001");
    expect(container.textContent).toContain("INV-0002");
    expect(container.textContent).toContain("Sent");
    expect(container.textContent).toContain("Paid");
  });

  it("paid status persists and is displayed correctly", () => {
    const container = renderPage();
    const rows = container.querySelectorAll("tbody tr") as NodeListOf<HTMLElement>;
    const paidRow = Array.from(rows).find((r: HTMLElement) => r.textContent?.includes("INV-0002"));
    expect(paidRow).toBeTruthy();
    expect((paidRow as HTMLElement).textContent).toContain("Paid");
    expect((paidRow as HTMLElement).textContent).toContain("€2000.00");
  });

  it("displays correct totals", () => {
    const container = renderPage();
    expect(container.textContent).toContain("€1700.00");
    expect(container.textContent).toContain("$2000.00");
  });

  it("shows empty state when no invoices match", () => {
    vi.mocked(hooks.useInvoices).mockReturnValue({ data: [], isLoading: false } as any);
    const container = renderPage();
    expect(container.textContent).toContain("No se encontraron facturas");
  });
});
