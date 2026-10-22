import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useLocation } from "@/lib/router-compat";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { TestRouter } from "@/test/router";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { getInvoiceBackNavigation } from "@/lib/navigation/customerInvoiceOrigins";
const rows = Array.from({ length: 80 }, (_, i) => ({
  id: String(i),
  name: `QA ${String(i).padStart(2, "0")}`,
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
function List() {
  const navigate = useNavigateTransition();
  const { filtered, values, set } = useTableFilters({
    items: rows,
    facets: { q: { type: "text", fields: ["name"] } },
  });
  const viewState = useTableViewState(filtered.length);
  const table = useLiftgoTable({
    ...viewState,
    data: filtered,
    columns: [{ id: "name", accessorKey: "name" }],
    getRowId: (r) => r.id,
    initialPageSize: 25,
  });
  return (
    <>
      <output data-testid="state">
        {JSON.stringify({
          q: values.q,
          page: table.state.pagination.pageIndex,
          sorting: table.state.sorting,
          first: table.getRowModel().rows[0]?.id,
        })}
      </output>
      <button onClick={() => table.setPageIndex(2)}>Page 3</button>
      <button onClick={() => table.setSorting([{ id: "name", desc: true }])}>
        Descending
      </button>
      <button onClick={() => navigate("/bookings/bk-1")}>Open</button>
      <button onClick={() => set("q", "QA 07")}>Filter</button>
    </>
  );
}
function Flow() {
  const l = useLocation();
  return l.pathname === "/bookings" ? (
    <List />
  ) : (
    <DetailPageHeader title="Reserva" backTo="/bookings" />
  );
}
describe("navigation context baseline reproduction", () => {
  it("list-detail-return restores q but preserves page and ordering (same task, no data mutation)", async () => {
    render(
      <TestRouter initialEntries={["/bookings?q=QA"]}>
        <Flow />
      </TestRouter>,
    );
    await screen.findByTestId("state");
    fireEvent.click(screen.getByText("Descending"));
    fireEvent.click(screen.getByText("Page 3"));
    let state = JSON.parse(screen.getByTestId("state").textContent!);
    expect(state).toMatchObject({
      q: "QA",
      page: 2,
      sorting: [{ id: "name", desc: true }],
    });
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() =>
      expect(screen.getByTestId("state")).toBeInTheDocument(),
    );
    state = JSON.parse(screen.getByTestId("state").textContent!);
    expect(state).toMatchObject({
      q: "QA",
      page: 2,
      sorting: [{ id: "name", desc: true }],
      first: "29",
    });
  });
  it("invoice without captured origin goes to invoices, customer origin is preserved", () => {
    expect(
      getInvoiceBackNavigation(
        undefined,
        "11111111-1111-4111-8111-111111111111",
      ).backTo,
    ).toBe("/invoices");
    const customer = "/customers/11111111-1111-4111-8111-111111111111";
    expect(
      getInvoiceBackNavigation(
        { customerInvoiceBackTo: customer },
        "11111111-1111-4111-8111-111111111111",
      ).backTo,
    ).toBe(customer);
  });
});

it("preserves exact report and booking origins and rejects external destinations", () => {
  const report = "/reports?type=revenue&from=2026-01-01&to=2026-01-31";
  expect(
    getInvoiceBackNavigation({ reportInvoiceBackTo: report }, null),
  ).toEqual({ backTo: report, restoreListFilters: false });
  const booking = "/bookings/11111111-1111-4111-8111-111111111111";
  expect(
    getInvoiceBackNavigation({ bookingInvoiceBackTo: booking }, null).backTo,
  ).toBe(booking);
  for (const invalid of [
    "https://evil.test/reports",
    "//evil.test/reports",
    "/reports-evil",
    "/reports\\evil",
    "/bookings/no-id",
  ]) {
    expect(
      getInvoiceBackNavigation(
        { reportInvoiceBackTo: invalid, bookingInvoiceBackTo: invalid },
        null,
      ).backTo,
    ).toBe("/invoices");
  }
});

it("clamps expired page URLs and resets the page when filters change", async () => {
  render(
    <TestRouter
      initialEntries={["/bookings?tablePage=100000&tableSort=%5B%5D"]}
    >
      <Flow />
    </TestRouter>,
  );
  await screen.findByTestId("state");
  expect(JSON.parse(screen.getByTestId("state").textContent!).page).toBe(3);
  fireEvent.click(screen.getByText("Filter"));
  await waitFor(() =>
    expect(JSON.parse(screen.getByTestId("state").textContent!).page).toBe(0),
  );
  expect(JSON.parse(screen.getByTestId("state").textContent!).q).toBe("QA 07");
});

it("preserves a validated quote origin through booking and invoice, not arbitrary state", () => {
  const booking = "/bookings/11111111-1111-4111-8111-111111111111";
  const quote = "/quotes/22222222-2222-4222-8222-222222222222";
  expect(
    getInvoiceBackNavigation(
      {
        bookingInvoiceBackTo: booking,
        bookingReturnState: { quoteReturnTo: quote, unexpected: "discard" },
      },
      null,
    ).backState,
  ).toEqual({ quoteReturnTo: quote });
  expect(
    getInvoiceBackNavigation(
      {
        bookingInvoiceBackTo: booking,
        bookingReturnState: {
          quoteReturnTo: "https://evil.test",
          calendarReturnTo: "//evil.test",
        },
      },
      null,
    ).backState,
  ).toBeUndefined();
});
