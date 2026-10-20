import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { LiftgoTable } from "@/components/dataTable/v2/types";
import type { Tables } from "@/integrations/supabase/types";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { TestRouter } from "@/test/router";
import InvoicesPage from "../InvoicesPage";

type Order = { column: string; ascending: boolean; nullsFirst?: boolean };
type FixtureRow = { id: string; invoice_number: string; total: number; customer_name: string | null; status: string; cfdi_status: string; issued_at: string; moneda: string; created_at: string };
const api = vi.hoisted(() => ({ from: vi.fn(), notifyError: vi.fn(), exportCsv: vi.fn(), failAt: Infinity, requests: [] as { from: number; orders: Order[] }[], rows: [] as FixtureRow[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
vi.mock("@/components/layout/ListPageLayout", () => ({
  ListPageLayout: ({ table, isLoading, actions }: { table: LiftgoTable<Tables<"invoices">>; isLoading: boolean; actions: ReactNode }) => <div>
    {actions}
    <button onClick={() => table.setSorting([{ id: "total", desc: true }])}>Total descending</button>
    <button onClick={() => table.setSorting([{ id: "total", desc: false }])}>Total ascending</button>
    <button onClick={() => table.setSorting([{ id: "customer_name", desc: true }])}>Customer descending</button>
    <button onClick={() => table.setSorting([])}>Clear sorting</button>
    <button onClick={() => table.nextPage()}>Next</button>
    <output data-testid="loading">{String(isLoading)}</output>
    <output data-testid="page">{table.state.pagination.pageIndex}</output>
    <output data-testid="rows">{table.getRowModel().rows.map(row => row.original.total).join(",")}</output>
    <output data-testid="ids">{table.getRowModel().rows.map(row => row.original.id).join(",")}</output>
  </div>,
}));
vi.mock("@/lib/exportCsv", () => ({ exportToCsv: api.exportCsv }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: api.notifyError }));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: () => undefined }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("../../components/list/InvoicesToolbar", () => ({ InvoicesActionsBar: ({ onExport }: { onExport: () => void }) => <button onClick={onExport}>Export CSV</button>, InvoicesFiltersBar: () => null }));
vi.mock("../../components/recurring/RecurringInvoicesPreviewDialog", () => ({ RecurringInvoicesPreviewDialog: () => null }));
vi.mock("../../components/recurring/RecurringInvoicesResultDialog", () => ({ RecurringInvoicesResultDialog: () => null }));
vi.mock("../../hooks/invoices/recurring/useGenerateRecurringInvoices", () => ({ useGenerateRecurringInvoices: () => ({ mutate: vi.fn() }) }));
vi.mock("../../hooks/invoices/recurring/usePreviewRecurringInvoices", () => ({ usePreviewRecurringInvoices: () => ({ mutate: vi.fn() }) }));

function compareRows(a: FixtureRow, b: FixtureRow, orders: Order[]) {
  for (const { column, ascending, nullsFirst } of orders) {
    const left = a[column as keyof FixtureRow], right = b[column as keyof FixtureRow];
    if (left === right) continue;
    if (left === null) return nullsFirst ? -1 : 1;
    if (right === null) return nullsFirst ? 1 : -1;
    const comparison = left < right ? -1 : 1;
    return ascending ? comparison : -comparison;
  }
  return 0;
}

beforeEach(() => {
  api.rows = Array.from({ length: 150 }, (_, i) => ({
    id: `inv-${String(i + 1).padStart(4, "0")}`, invoice_number: `FAC-${String(i + 1).padStart(4, "0")}`,
    total: i + 1, status: "sent", cfdi_status: "stamped", customer_name: "QA", issued_at: "2026-10-20", moneda: "MXN",
    created_at: new Date(Date.UTC(2026, 9, 20) - i * 1000).toISOString(),
  }));
  api.requests = []; api.from.mockReset(); api.failAt = Infinity; api.notifyError.mockReset(); api.exportCsv.mockReset();
  api.from.mockImplementation(() => {
    let from = 0, to = 0;
    const orders: Order[] = [];
    const query = {
      select: () => query, or: () => query,
      order: (column: string, options: Omit<Order, "column">) => { orders.push({ column, ...options }); return query; },
      range: (a: number, b: number) => { from = a; to = b; return query; },
      returns: async () => {
        api.requests.push({ from, orders });
        if (from >= api.failAt) return { data: null, error: new Error("export unavailable") };
        return { data: [...api.rows].sort((a, b) => compareRows(a, b, orders)).slice(from, to + 1), error: null };
      },
    };
    return query;
  });
});
afterEach(cleanup);
function visible() { return (screen.getByTestId("rows").textContent ?? "").split(",").filter(Boolean).map(Number); }
function visibleIds() { return (screen.getByTestId("ids").textContent ?? "").split(",").filter(Boolean); }
async function start() {
  const { Wrapper, queryClient } = createQueryWrapper();
  render(<Wrapper><TestRouter initialEntries={["/invoices"]}><InvoicesPage /></TestRouter></Wrapper>);
  await waitFor(() => expect(visible()).toHaveLength(25));
  return queryClient;
}
async function next() {
  const current = Number(screen.getByTestId("page").textContent);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent(String(current + 1)));
}
async function sort(label: string, expectedFirst: number) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => {
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(visible()[0]).toBe(expectedFirst);
  });
}

describe("QR06: invoice server-global sorting and pagination", () => {
  it.each([true, false])("keeps all 150 invoices in global order without repeats, descending=%s", async (desc) => {
    await start();
    await sort(desc ? "Total descending" : "Total ascending", desc ? 150 : 1);
    const values = [...visible()], ids = [...visibleIds()];
    for (let page = 1; page < 6; page++) {
      await next();
      values.push(...visible()); ids.push(...visibleIds());
    }
    expect(values).toEqual(Array.from({ length: 150 }, (_, i) => desc ? 150 - i : i + 1));
    expect(new Set(ids).size).toBe(150);
    const requests = api.requests.filter(request => request.orders[0].column === "total");
    expect(requests.map(request => request.from)).toEqual([0, 100]);
    expect(requests.every(request => request.orders[0].ascending === !desc)).toBe(true);
    expect(requests.every(request => request.orders.at(-1)?.column === "id")).toBe(true);
  });

  it("starts again at page zero with a separate query when sorting changes after page four", async () => {
    const client = await start();
    await sort("Total ascending", 1);
    await next(); await next(); await next();
    expect(visible()[0]).toBe(76);
    await sort("Total descending", 150);
    expect(screen.getByTestId("page")).toHaveTextContent("0");
    expect(api.requests.at(-1)?.from).toBe(0);
    const activeQuery = client.getQueryCache().getAll().find(query => query.getObserversCount() > 0);
    expect(activeQuery?.queryKey.at(-1)).toEqual([{ id: "total", desc: true }]);
    expect(visible()).toEqual(Array.from({ length: 25 }, (_, i) => 150 - i));
  });

  it("uses a stable ID tie-breaker for duplicate sort values across the server boundary", async () => {
    api.rows.forEach(row => { row.total = 100; });
    await start();
    await sort("Total descending", 100);
    const ids = [...visibleIds()];
    for (let page = 1; page < 6; page++) { await next(); ids.push(...visibleIds()); }
    expect(ids).toEqual(api.rows.map(row => row.id).sort().reverse());
    expect(new Set(ids).size).toBe(150);
  });

  it("keeps null customer names last and uses the default global order when sorting is cleared", async () => {
    api.rows.forEach((row, index) => { row.customer_name = index < 125 ? null : "Zulu"; });
    await start();
    await sort("Customer descending", 150);
    expect(visible()).toEqual(Array.from({ length: 25 }, (_, i) => 150 - i));
    expect(api.requests.at(-1)?.orders[0]).toEqual({ column: "customer_name", ascending: false, nullsFirst: false });
    await sort("Clear sorting", 1);
    expect(api.requests.at(-1)?.orders).toEqual([
      { column: "created_at", ascending: false }, { column: "id", ascending: false },
    ]);
  });

  it("reports a failed export and never downloads the partially fetched rows", async () => {
    await start();
    api.failAt = 150;
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(api.notifyError).toHaveBeenCalledWith({
      title: "No se pudieron exportar las facturas", error: expect.any(Error),
    }));
    expect(api.exportCsv).not.toHaveBeenCalled();
  });

});
