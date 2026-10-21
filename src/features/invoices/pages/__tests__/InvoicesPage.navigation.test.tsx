import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import InvoicesPage from "../InvoicesPage";

const invoice = vi.hoisted(() => ({ id: "inv-1", invoice_number: "FAC-0001" }));
vi.mock("@/components/dataTable/v2", () => ({ useLiftgoTable: () => ({ state: { pagination: { pageIndex: 0, pageSize: 25 } } }) }));
vi.mock("@/components/layout/ListPageLayout", () => ({
  ListPageLayout: ({ onRowClick }: { onRowClick: (row: typeof invoice) => void }) => (
    <button onClick={() => onRowClick(invoice)}>Open desktop invoice</button>
  ),
}));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: () => undefined }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => "org-a" }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "user:org-a" }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: (_module: string, access: string) => access === "read" }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));
vi.mock("../../components/list/InvoicesToolbar", () => ({ InvoicesActionsBar: () => null, InvoicesFiltersBar: () => null }));
vi.mock("../../components/recurring/RecurringInvoicesPreviewDialog", () => ({ RecurringInvoicesPreviewDialog: () => null }));
vi.mock("../../components/recurring/RecurringInvoicesResultDialog", () => ({ RecurringInvoicesResultDialog: () => null }));
vi.mock("../../hooks/invoices/recurring/useGenerateRecurringInvoices", () => ({ useGenerateRecurringInvoices: () => ({ mutate: vi.fn() }) }));
vi.mock("../../hooks/invoices/recurring/usePreviewRecurringInvoices", () => ({ usePreviewRecurringInvoices: () => ({ mutate: vi.fn() }) }));
vi.mock("../../hooks/invoices/useInvoices", () => ({
  useInvoicesInfinite: () => ({ data: { pages: [{ rows: [invoice] }] }, isLoading: false, isError: false }),
  invoiceQueries: { detail: vi.fn() }, fetchInvoicesForExport: vi.fn(),
}));

describe("InvoicesPage detail navigation", () => {
  it("keeps the exact list URL in the desktop detail history entry", async () => {
    const origin = "/invoices?q=cliente&status=sent&cfdi=stamped&from=2026-10-01&to=2026-10-31";
    function Probe() {
      const location = useLocation();
      return <output data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>;
    }
    render(<TestRouter initialEntries={[origin]}><InvoicesPage /><Probe /></TestRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open desktop invoice" }));
    await waitFor(() => {
      const location = JSON.parse(screen.getByTestId("location").textContent ?? "{}");
      expect(location.pathname).toBe("/invoices/inv-1");
      expect(location.state.invoiceListBackTo).toBe(origin);
    });
  });
});
