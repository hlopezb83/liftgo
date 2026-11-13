import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import PortalStatement from "./PortalStatement";

type InvoicePage = { rows: { id: string; invoice_number: string; total: number }[]; totalCount: number };
const request = vi.hoisted(() => vi.fn<(page: number, onlyBalance: boolean) => Promise<InvoicePage>>());
vi.mock("@/features/customers", () => ({
  usePortalCustomer: () => ({ data: { id: "customer-1", name: "Cliente de prueba" }, isLoading: false, refetch: () => undefined }),
  useCustomerSummary: () => ({ data: { invoices: [], totals: { total_invoiced: 50, total_paid: 0, outstanding_revenue: 50 } }, isLoading: false, refetch: () => undefined }),
  usePortalInvoicesPage: (page: number, _size: number, onlyBalance: boolean) => useQuery({
    queryKey: ["portal-invoices-test", page, onlyBalance], queryFn: () => request(page, onlyBalance),
  }),
}));
vi.mock("../components/statement/PortalInvoicesTable", () => ({
  PortalInvoicesTable: ({ rows }: { rows: { inv: { invoice_number: string } }[] }) => <div>{rows.map(row => <p key={row.inv.invoice_number}>{row.inv.invoice_number}</p>)}</div>,
}));

const firstPage: InvoicePage = { rows: [{ id: "1", invoice_number: "FAC-PRIMERA", total: 1 }], totalCount: 50 };
const secondPage: InvoicePage = { rows: [{ id: "26", invoice_number: "FAC-SEGUNDA", total: 1 }], totalCount: 50 };
let client: QueryClient;
function renderStatement() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  return render(<QueryClientProvider client={client}><TestRouter><PortalStatement /></TestRouter></QueryClientProvider>);
}
beforeEach(() => { request.mockReset(); });
afterEach(() => { client?.clear(); });

describe("estado de cuenta: páginas aún sin respuesta", () => {
  it("conserva la página solicitada mientras llega una respuesta lenta", async () => {
    let resolvePage!: (value: InvoicePage) => void;
    const pendingPage = new Promise<InvoicePage>(resolve => { resolvePage = resolve; });
    request.mockImplementation(page => page === 1 ? Promise.resolve(firstPage) : pendingPage);
    renderStatement();
    await screen.findByText("FAC-PRIMERA");
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página siguiente" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(2, false));
    // Deja pasar el turno que antes ajustaba la página a 1 por un total provisional.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { resolvePage(secondPage); await pendingPage; });
    expect(await screen.findByText("FAC-SEGUNDA")).toBeInTheDocument();
    expect(screen.queryByText("FAC-PRIMERA")).not.toBeInTheDocument();
  });

  it("permite reintentar la página fallida sin regresar a la primera", async () => {
    request.mockImplementation(page => page === 1 ? Promise.resolve(firstPage) : Promise.reject(new Error("Lectura fallida")));
    renderStatement();
    await screen.findByText("FAC-PRIMERA");
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página siguiente" }));
    expect(await screen.findByText("No se pudo cargar tu estado de cuenta")).toBeInTheDocument();
    request.mockImplementation(page => Promise.resolve(page === 1 ? firstPage : secondPage));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("FAC-SEGUNDA")).toBeInTheDocument();
  });

  it("ajusta una página que sí dejó de existir después de recibir el total nuevo", async () => {
    request.mockImplementation(page => Promise.resolve(page === 1 ? firstPage : { rows: [], totalCount: 1 }));
    renderStatement();
    await screen.findByText("FAC-PRIMERA");
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página siguiente" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(2, false));
    expect(await screen.findByText("FAC-PRIMERA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 1" })).toHaveAttribute("aria-current", "page");
  });
});
