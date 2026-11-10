import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import type { QuotesPageFilters } from "../../hooks/quotes/useQuotesPage";
import QuotesPage from "../QuotesPage";

const state = vi.hoisted(() => ({ mobile: false, error: false, loading: false, retry: vi.fn(), requests: [] as QuotesPageFilters[] }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile, useIsTabletOrBelow: () => state.mobile }));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: () => undefined }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../../hooks/quoteDetail/useQuoteDetailData", () => ({ isPublicoGeneral: () => false }));
vi.mock("../../hooks/quotes/useQuotes", () => ({ quoteQueries: { detail: vi.fn() } }));
vi.mock("../../hooks/quotes/useQuotesPage", () => ({
  useQuotesPage: (filters: QuotesPageFilters) => {
    state.requests.push(filters);
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `quote-${index}`, quote_number: index === 500 ? "COT-0445" : `COT-${1000 + index}`,
      customer_name: index === 500 ? "Cliente antiguo" : "Cliente reciente",
      status: index === 500 ? "accepted" : "draft", total: 116, currency: "MXN", quote_type: "rental",
    })).filter((row) => (!filters.search || `${row.quote_number} ${row.customer_name}`.toLowerCase().includes(filters.search.toLowerCase())) && (filters.status === "all" || row.status === filters.status));
    if (filters.sorting.some((sort) => sort.id === "quote_number")) {
      const desc = filters.sorting.find((sort) => sort.id === "quote_number")!.desc;
      rows.sort((a, b) => a.quote_number.localeCompare(b.quote_number, undefined, { numeric: true }) * (desc ? -1 : 1));
    }
    const pageIndex = Math.min(filters.pageIndex, Math.max(0, Math.ceil(rows.length / filters.pageSize) - 1));
    return {
      data: state.loading || state.error ? undefined : { items: rows.slice(pageIndex * filters.pageSize, (pageIndex + 1) * filters.pageSize), totalCount: rows.length, pageIndex },
      isLoading: state.loading, isError: state.error, refetch: state.retry,
    };
  },
}));

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{location.pathname}{location.search}</output>;
}
function mount(origin = "/quotes") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><TestRouter initialEntries={[origin]}>{children}</TestRouter></QueryClientProvider>;
  return render(<><QuotesPage /><Probe /></>, { wrapper });
}

beforeEach(() => { state.mobile = false; state.error = false; state.loading = false; state.requests = []; state.retry.mockReset(); });
afterEach(cleanup);

describe.each([false, true])("QuotesPage server list, mobile=%s", (mobile) => {
  beforeEach(() => { state.mobile = mobile; });

  it("pages beyond 500 on both presentations with a remote total", async () => {
    mount();
    expect(await screen.findByText("1–25 de 501")).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando los primeros/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página siguiente" }));
    expect(await screen.findByText("26–50 de 501")).toBeInTheDocument();
    expect(state.requests.at(-1)?.pageIndex).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "21" }));
    expect(await screen.findByText("501–501 de 501")).toBeInTheDocument();
    expect(screen.getByText("COT-0445")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a la página siguiente" })).toBeDisabled();
    if (mobile) expect(screen.getByRole("link", { name: "Ver cotización COT-0445 de Cliente antiguo" })).toHaveAttribute("href", "/quotes/quote-500");
    else expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("searches from a later page, resets the URL page, retains status, and clears filters", async () => {
    mount("/quotes?status=draft&tablePage=1&tableSize=25");
    expect(await screen.findByText("26–50 de 500")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar cotizaciones…" }), { target: { value: "COT-0445" } });
    expect(await screen.findByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    expect(state.requests.at(-1)).toMatchObject({ search: "COT-0445", status: "draft", pageIndex: 0 });
    fireEvent.click(screen.getAllByRole("button", { name: "Limpiar filtros" }).at(-1)!);
    expect(await screen.findByText("1–25 de 501")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar cotizaciones…" }), { target: { value: "antiguo" } });
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByText("COT-0445")).toBeInTheDocument();
    expect(screen.getByTestId("url").textContent).not.toContain("tablePage=");
  });

  it("recovers a stale page URL and keeps errors distinct from empty/loading", async () => {
    mount("/quotes?status=accepted&tablePage=99");
    expect(await screen.findByText("COT-0445")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("url").textContent).toContain("tablePage=0"));
    cleanup();
    state.error = true;
    mount("/quotes?q=absent");
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No hay resultados con los filtros actuales")).toBeNull();
    cleanup();
    state.error = false; state.loading = true;
    mount();
    await screen.findByText("Cotizaciones");
    expect(screen.queryByText("No hay cotizaciones aún")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ir a la página siguiente" })).toBeNull();
  });
});

// The list passes sort state to the server rather than sorting only the current page.
it("requests natural Folio ordering and renders the server's first row", async () => {
  mount();
  const header = await screen.findByRole("button", { name: "Folio" });
  expect(screen.queryByText("Folio (texto)")).toBeNull();
  fireEvent.click(header);
  await waitFor(() => expect(state.requests.at(-1)?.sorting).toEqual([{ id: "quote_number", desc: false }]));
  expect(screen.getByText("COT-0445")).toBeInTheDocument();
});
