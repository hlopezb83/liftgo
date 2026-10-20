import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailBody } from "@/features/invoices/components/invoice-detail/InvoiceDetailBody";
import { useLocation } from "@/lib/router-compat";
import MainLayout from "@/layouts/MainLayout";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";
import CustomersPage from "../CustomersPage";
import CustomerDetailPage from "../CustomerDetailPage";

const access = vi.hoisted(() => ({ level: "full", financial: true }));
const customerId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const listOrigin = "/customers?q=QA-AUDIT#main-content";
const customerOrigin = `/customers/${customerId}`;

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "admin" }),
  useRolePermissions: () => ({ data: {} }),
  getAccessLevel: () => access.level,
  useHasModuleAccess: () => true,
  useHasFinancialAccess: () => access.financial,
}));
// Keep the real layout, list/table, detail, invoice row and return buttons.
// Only unrelated shell widgets and backend data are replaced offline.
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/components/feedback/KeyboardShortcutsDialog", () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock("@/layouts/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/layouts/TopbarBreadcrumbs", () => ({ TopbarBreadcrumbs: () => null }));
vi.mock("@/layouts/TopbarUserMenu", () => ({ TopbarUserMenu: () => null }));
vi.mock("@/layouts/OfflineBanner", () => ({ OfflineBanner: () => null }));
vi.mock("@/features/feedback", () => ({ FeedbackFab: () => null }));
vi.mock("@/features/system/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/features/crm", () => ({ useUpdateProspect: () => ({ mutate: vi.fn() }) }));
vi.mock("../../hooks/customers/customerQueries", () => ({
  useCustomersIncremental: () => ({ data: { pages: [[{ id: customerId, name: "QA-AUDIT", rfc: null, phone: null, email: null }]] }, isLoading: false, isError: false,
    refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
}));
vi.mock("../../hooks/customers/useCustomers", () => ({
  useCreateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../components/customers/CustomersToolbar", () => ({
  CustomersActions: () => null, CustomersSecondaryActions: () => null, CustomersFilters: () => null,
}));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../../hooks/customers/useCustomerDetailPage", () => ({
  useCustomerDetailPage: () => ({
    customer: { id: customerId, name: "Cliente de prueba" },
    summary: {}, bookings: [],
    invoices: [
      { id: invoiceId, invoice_number: "FAC-USD", total: 100, currency: "USD", tipo_cambio: 17.5, status: "sent", issued_at: "2026-10-19" },
      { id: "33333333-3333-4333-8333-333333333333", invoice_number: "FAC-MXN", total: 100, currency: "MXN", status: "sent", issued_at: "2026-10-19" },
    ],
    updateCustomer: {}, deleteCustomer: {}, inviteCustomer: {},
  }),
}));
vi.mock("../../components/customer-detail/CustomerBookingsHistory", () => ({ CustomerBookingsHistory: () => null }));
vi.mock("../../components/customer-detail/CustomerContactCard", () => ({ CustomerContactCard: () => null }));
vi.mock("../../components/customer-detail/CustomerDeleteDialog", () => ({ CustomerDeleteDialog: () => null }));
vi.mock("../../components/customer-detail/CustomerFinancialSummary", () => ({ CustomerFinancialSummary: () => null }));
vi.mock("../../components/customer-detail/CustomerInviteDialog", () => ({ CustomerInviteDialog: () => null }));
vi.mock("../../components/customer-detail/CustomerProfitabilityCard", () => ({ CustomerProfitabilityCard: () => null }));
vi.mock("../../components/customers/CustomerFormDialog", () => ({ CustomerFormDialog: () => null }));
vi.mock("@/components/domain/ReadOnlyLineItemsTable", () => ({ ReadOnlyLineItemsTable: () => null }));
vi.mock("@/components/domain/TotalsSummary", () => ({ TotalsSummary: () => null }));
vi.mock("@/features/invoices/components/StampErrorDialog", () => ({ StampErrorDialog: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceCreditNotesCard", () => ({ InvoiceCreditNotesCard: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceDetailActions", () => ({ InvoiceDetailActions: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceDetailBadges", () => ({ InvoiceDetailBadges: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceDetailDialogs", () => ({ InvoiceDetailDialogs: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceDetailIdentifiers", () => ({ InvoiceDetailIdentifiers: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceFinancialOverview", () => ({ InvoiceFinancialOverview: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceFiscalDataCard", () => ({ InvoiceFiscalDataCard: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceHistoryCard", () => ({ InvoiceHistoryCard: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoicePaymentSummary", () => ({ InvoicePaymentSummary: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceSourceLinks", () => ({ InvoiceSourceLinks: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/InvoiceSummaryCards", () => ({ InvoiceSummaryCards: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/PaymentIntentsSection", () => ({ PaymentIntentsSection: () => null }));
vi.mock("@/features/invoices/components/invoice-detail/ValidateReceptorButton", () => ({ ValidateReceptorButton: () => null }));

const invoiceProps = {
  invoice: { id: invoiceId, customer_id: customerId, invoice_number: "FAC-USD" }, id: invoiceId,
  derived: { visibility: {}, paymentList: [], lineItems: [] },
  actions: { stampCfdi: { isPending: false } }, sourceBookings: [], refetch: vi.fn(),
} as unknown as ComponentProps<typeof InvoiceDetailBody>;

function Flow() {
  const location = useLocation();
  return <>
    <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
    {location.pathname === "/customers" ? (
      <CustomersPage />
    ) : location.pathname.startsWith("/customers/") ? (
      <CustomerDetailPage />
    ) : location.pathname.startsWith("/invoices/") ? (
      <InvoiceDetailBody {...invoiceProps} />
    ) : null}
  </>;
}

function renderFlow(entry = listOrigin) {
  const root = createRootRoute({ component: MainLayout });
  const routes = ["/customers", "/customers/$id", "/invoices/$id"].map((path) =>
    createRoute({ getParentRoute: () => root, path, component: Flow }),
  );
  const router = createRouter({ routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
    parseSearch, stringifySearch, defaultPendingMinMs: 0 });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

async function openCustomer() {
  const router = renderFlow();
  fireEvent.click((await screen.findAllByText("QA-AUDIT"))[0]);
  await screen.findByText("Cliente de prueba");
  return router;
}

beforeEach(() => { access.level = "full"; access.financial = true; window.sessionStorage.clear(); });

describe("Customer invoice currency and return navigation", () => {
  it("hides invoices and statement export from dispatcher even with stale privileged data", async () => {
    access.financial = false;
    await openCustomer();
    expect(screen.queryByText("FAC-USD")).not.toBeInTheDocument();
    expect(screen.queryByText("FAC-MXN")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Estado de Cuenta" })).not.toBeInTheDocument();
    expect(screen.getByText("Cliente de prueba")).toBeInTheDocument();
  });

  it("labels USD and MXN totals explicitly without converting the original amounts", async () => {
    await openCustomer();
    for (const code of ["USD", "MXN"]) {
      const row = screen.getByText(`FAC-${code}`).closest("[role=button]");
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText(code)).toBeInTheDocument();
      expect(row?.textContent).toMatch(/100\.00/);
      expect(row?.textContent).not.toMatch(/1,750/);
    }
  });

  it.each(["mouse", "Enter", " "])("returns invoice → customer → exact customer list after %s activation", async (activation) => {
    await openCustomer();
    const row = screen.getByRole("button", { name: /FAC-USD/ });
    if (activation === "mouse") fireEvent.click(row);
    else fireEvent.keyDown(row, { key: activation });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/invoices/${invoiceId}`));
    window.sessionStorage.setItem("list-filters:/customers", "q=changed-in-another-tab");
    window.sessionStorage.setItem("list-filters:/invoices", "q=unrelated");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(customerOrigin));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(listOrigin));
  });

  it.each(["mouse", "Enter", " "])("preserves real list → detail → skip → invoice → two returns with %s invoice-row activation", async (activation) => {
    const router = await openCustomer();
    const main = screen.getByRole("main");
    main.scrollTop = 350;
    const skip = screen.getByRole("link", { name: "Saltar al contenido" });
    skip.focus();
    // A link's keyboard Enter activation dispatches click in the browser.
    fireEvent.click(skip);
    await waitFor(() => expect(router.state.location.hash).toBe("main-content"));
    expect(main).toHaveFocus();
    expect(main.scrollTop).toBe(0);
    expect(router.state.location.state).toMatchObject({ customerListBackTo: listOrigin });
    // Repeated activation on the same fragment must also retain focus/state.
    main.scrollTop = 350;
    skip.focus();
    fireEvent.click(skip);
    expect(main).toHaveFocus();
    expect(main.scrollTop).toBe(0);
    expect(router.state.location.state).toMatchObject({ customerListBackTo: listOrigin });
    const row = screen.getByRole("button", { name: /FAC-USD/ });
    if (activation === "mouse") fireEvent.click(row);
    else fireEvent.keyDown(row, { key: activation });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/invoices/${invoiceId}`));
    window.sessionStorage.setItem("list-filters:/customers", "q=changed-in-another-tab");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`${customerOrigin}#main-content`));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(listOrigin));
  });

  it("keeps the current query and deep-entry fallback after skipping", async () => {
    window.sessionStorage.setItem("list-filters:/customers", "q=saved");
    const router = renderFlow(`${customerOrigin}?tab=invoices#history`);
    fireEvent.click(await screen.findByRole("link", { name: "Saltar al contenido" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`${customerOrigin}?tab=invoices#main-content`));
    expect(router.state.location.state).not.toHaveProperty("customerListBackTo");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/customers?q=saved"));
  });

  it("keeps read access informational with no invoice navigation", async () => {
    access.level = "read";
    await openCustomer();
    expect(screen.getByText("FAC-USD")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /FAC-USD/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("FAC-USD"));
    fireEvent.keyDown(screen.getByText("FAC-USD"), { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe(customerOrigin);
  });

  it("keeps Facturas=none hidden", async () => {
    access.level = "none";
    await openCustomer();
    expect(screen.queryByText("Facturas")).not.toBeInTheDocument();
    expect(screen.queryByText("FAC-USD")).not.toBeInTheDocument();
  });

  it("falls back safely to the customer list on direct visits without history state", async () => {
    window.sessionStorage.setItem("list-filters:/customers", "q=saved");
    renderFlow(`${customerOrigin}?tab=invoices#history`);
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/customers?q=saved"));
  });
});
