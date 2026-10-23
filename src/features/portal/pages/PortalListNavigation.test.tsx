import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import PortalInvoices from "./PortalInvoices";
import PortalQuotes from "./PortalQuotes";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  useIsTabletOrBelow: () => viewport.mobile,
}));
vi.mock("@/features/customers", () => ({
  usePortalInvoicesPage: () => ({
    data: {
      rows: [{ id: "inv-1", invoice_number: "FAC-0001", issued_at: "2026-10-01", due_date: "2026-10-31", total: "12000.00", moneda: "MXN", status: "sent" }],
      totalCount: 1,
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("../hooks/usePortalExtras", () => ({
  usePortalQuotesPage: () => ({
    data: {
      rows: [{ id: "quote-1", quote_number: "COT-0001", created_at: "2026-10-01", valid_until: "2026-10-31", total: "12000.00", currency: "MXN", status: "sent" }],
      totalCount: 1,
    },
    isLoading: false,
    isError: false,
  }),
}));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

const cases = [
  { label: "quotes", Component: PortalQuotes, number: "COT-0001", list: "/portal/quotes", detail: "/portal/quotes/quote-1" },
  { label: "invoices", Component: PortalInvoices, number: "FAC-0001", list: "/portal/invoices", detail: "/portal/invoices/inv-1" },
];

describe.each(cases)("Portal $label detail navigation", ({ Component, number, list, detail }) => {
  beforeEach(() => { viewport.mobile = true; });

  function renderList() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={[list]}><Component /><LocationProbe /></TestRouter>
      </QueryClientProvider>,
    );
  }

  it("exposes one native, focusable mobile link with the correct detail and accessible name", async () => {
    renderList();
    const link = await screen.findByRole("link", { name: new RegExp(number) });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", detail);
    expect(link.tabIndex).toBe(0);
    expect(link).toHaveClass("focus-visible:ring-2");
    expect(link.querySelector("a, button, input, [tabindex]")).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    link.focus();
    expect(link).toHaveFocus();
  });

  it("uses the router for ordinary mobile activation", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("link", { name: new RegExp(number) }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(detail));
  });

  it("leaves modified mobile clicks to the native link behavior", async () => {
    renderList();
    const link = await screen.findByRole("link", { name: new RegExp(number) });
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(screen.getByTestId("location").textContent).toBe(list);
  });

  it.each(["click", "Enter"])("keeps the desktop table and its %s detail navigation", async (activation) => {
    viewport.mobile = false;
    renderList();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: new RegExp(number) })).not.toBeInTheDocument();
    const row = within(table).getByRole("button", { name: new RegExp(number) });
    expect(row).toHaveAttribute("tabindex", "0");
    if (activation === "click") fireEvent.click(row);
    else fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(detail));
  });
});
