import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailBody } from "../InvoiceDetailBody";

const mocks = vi.hoisted(() => ({ state: null as unknown, navigate: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ state: mocks.state }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => mocks.navigate }));
vi.mock("@/components/domain/ReadOnlyLineItemsTable", () => ({ ReadOnlyLineItemsTable: () => null }));
vi.mock("@/components/domain/TotalsSummary", () => ({ TotalsSummary: () => null }));
vi.mock("../../StampErrorDialog", () => ({ StampErrorDialog: () => null }));
vi.mock("../InvoiceCreditNotesCard", () => ({ InvoiceCreditNotesCard: () => null }));
vi.mock("../InvoiceDetailActions", () => ({ InvoiceDetailActions: () => null }));
vi.mock("../InvoiceDetailBadges", () => ({ InvoiceDetailBadges: () => null }));
vi.mock("../InvoiceDetailDialogs", () => ({ InvoiceDetailDialogs: () => null }));
vi.mock("../InvoiceDetailIdentifiers", () => ({ InvoiceDetailIdentifiers: () => null }));
vi.mock("../InvoiceFinancialOverview", () => ({ InvoiceFinancialOverview: () => null }));
vi.mock("../InvoiceFiscalDataCard", () => ({ InvoiceFiscalDataCard: () => null }));
vi.mock("../InvoiceHistoryCard", () => ({ InvoiceHistoryCard: () => null }));
vi.mock("../InvoicePaymentSummary", () => ({ InvoicePaymentSummary: () => null }));
vi.mock("../InvoiceSourceLinks", () => ({ InvoiceSourceLinks: () => null }));
vi.mock("../InvoiceSummaryCards", () => ({ InvoiceSummaryCards: () => null }));
vi.mock("../PaymentIntentsSection", () => ({ PaymentIntentsSection: () => null }));
vi.mock("../ValidateReceptorButton", () => ({ ValidateReceptorButton: () => null }));

const props = {
  invoice: { invoice_number: "FAC-0001" }, id: "inv-1",
  derived: { visibility: {}, paymentList: [], lineItems: [] },
  actions: { stampCfdi: { isPending: false } }, sourceBookings: [], refetch: vi.fn(),
} as unknown as ComponentProps<typeof InvoiceDetailBody>;

beforeEach(() => {
  window.sessionStorage.clear(); mocks.state = null; vi.clearAllMocks();
});

describe("InvoiceDetailBody return navigation", () => {
  it.each([
    "/invoices?q=cliente&status=sent&cfdi=stamped&from=2026-10-01&to=2026-10-31",
    "/invoices",
  ])("returns to the exact list origin %s", (origin) => {
    mocks.state = { invoiceListBackTo: origin };
    window.sessionStorage.setItem("list-filters:/invoices", "q=changed-in-another-tab");
    render(<InvoiceDetailBody {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(mocks.navigate).toHaveBeenCalledWith(origin);
  });

  it.each([null, { invoiceListBackTo: "https://example.com/invoices" }, { invoiceListBackTo: "/invoices/other" }, { invoiceListBackTo: 123 }])(
    "uses saved invoice filters when the origin is missing or invalid: %j", (state) => {
      mocks.state = state;
      window.sessionStorage.setItem("list-filters:/invoices", "q=saved&status=paid");
      render(<InvoiceDetailBody {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Volver" }));
      expect(mocks.navigate).toHaveBeenCalledWith("/invoices?q=saved&status=paid");
    },
  );
});
