import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailBody } from "@/features/invoices/components/invoice-detail/InvoiceDetailBody";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import CustomerDetailPage from "../CustomerDetailPage";

const access = vi.hoisted(() => ({ level: "full" }));
const customerId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const listOrigin = "/customers?q=aceros&page=3&status=active#results";
const customerOrigin = `/customers/${customerId}?tab=invoices#history`;

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "admin" }),
  useRolePermissions: () => ({ data: {} }),
  getAccessLevel: () => access.level,
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
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
    {location.pathname === "/customers" ? (
      <button onClick={() => navigate(customerOrigin, { state: { customerListBackTo: listOrigin } })}>Abrir cliente</button>
    ) : location.pathname.startsWith("/customers/") ? (
      <CustomerDetailPage />
    ) : location.pathname.startsWith("/invoices/") ? (
      <InvoiceDetailBody {...invoiceProps} />
    ) : null}
  </>;
}

async function openCustomer() {
  render(<TestRouter initialEntries={[listOrigin]} path="/customers/$id"><Flow /></TestRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Abrir cliente" }));
  await screen.findByText("Cliente de prueba");
}

beforeEach(() => { access.level = "full"; window.sessionStorage.clear(); });

describe("Customer invoice currency and return navigation", () => {
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
    render(<TestRouter initialEntries={[customerOrigin]} path="/customers/$id"><Flow /></TestRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/customers?q=saved"));
  });
});
