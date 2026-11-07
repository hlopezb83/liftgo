import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityResults } from "../../hooks/useEntitySearch";

const state = vi.hoisted(() => ({
  quotes: true, routeQuotes: "read" as "none" | "read" | "full", financial: false,
  roleError: false, permissionsError: false, fetching: false, pending: false, error: false,
  data: undefined as EntityResults | undefined, debounce: undefined as string | undefined,
  navigate: vi.fn(), retry: vi.fn(),
}));
vi.mock("@/features/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/users")>();
  const full = Object.fromEntries(actual.MODULES.map((module) => [module, "full"]));
  return {
    ...actual,
    useHasFinancialAccess: () => state.financial,
    useHasModuleAccess: () => state.quotes,
    useUserRole: () => ({ data: "sales", isError: state.roleError }),
    useRolePermissions: () => ({ data: { sales: { ...full, Cotizaciones: state.routeQuotes } }, isError: state.permissionsError }),
  };
});
vi.mock("@/app-routes/routes-config", () => ({ routeLoaders: {} }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => state.debounce ?? value }));
vi.mock("@/features/system/hooks/useEntitySearch", () => ({
  useEntitySearch: () => ({ data: state.data, isFetching: state.fetching, isPending: state.pending, isError: state.error, refetch: state.retry }),
}));
// Command and Dialog are intentionally real: cmdk filters and sorts DOM items.
import { GlobalSearch } from "../GlobalSearch";

function empty(): EntityResults { return { invoices: [], quotes: [], customers: [], bookings: [], deliveries: [], returns: [] }; }
function results(): EntityResults {
  return { ...empty(), quotes: [
    { id: "old", label: "COT-0445", sub: "Cliente antiguo", url: "/quotes/old" },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `new-${index}`, label: `COT-1445${index}`, sub: "445 cliente reciente", url: `/quotes/new-${index}`,
    })),
  ] };
}

beforeEach(() => {
  state.quotes = true; state.routeQuotes = "read"; state.financial = false;
  state.roleError = false; state.permissionsError = false; state.fetching = false; state.pending = false; state.error = false;
  state.data = results(); state.debounce = undefined;
  state.navigate.mockReset(); state.retry.mockReset();
});

async function search(term: string) {
  fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
  const input = await screen.findByRole("combobox");
  fireEvent.change(input, { target: { value: term } });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  return input;
}

describe("GlobalSearch cotizaciones con cmdk real", () => {
  it.each(["445", "0445", "COT-0445", "cot-445", "000445"])("mantiene exacta normalizada %s visible, primera y navegable con Enter", async (query) => {
    render(<GlobalSearch />);
    const input = await search(query);
    const exact = await screen.findByRole("option", { name: "COT-0445 Cliente antiguo" });
    expect(screen.getAllByRole("option")[0]).toBe(exact);
    expect(exact).toHaveAttribute("data-value", query);
    // Select via the real cmdk keyboard handler, not a stubbed onSelect.
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/quotes/old"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("no desactiva el filtrado local de módulos ni sus keywords", async () => {
    state.data = empty();
    render(<GlobalSearch />);
    const input = await search("Cotizaciones");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Cotizaciones" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "gantt" } });
    expect(await screen.findByRole("option", { name: "Calendario" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cotizaciones" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Calendario" }));
    expect(state.navigate).toHaveBeenCalledWith("/calendar");
  });

  it("retira hits y avisos de quotes al revocar permiso aunque queden en cache", async () => {
    state.data!.errors = { quotes: "private secret" };
    const { rerender } = render(<GlobalSearch />);
    await search("445");
    expect(screen.getByText(/No se pudo buscar en: Cotizaciones/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "COT-0445 Cliente antiguo" })).toBeInTheDocument();
    state.quotes = false; state.routeQuotes = "none";
    rerender(<GlobalSearch />);
    expect(screen.queryByText(/COT-0445/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo buscar en/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar búsqueda" })).not.toBeInTheDocument();
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it.each(["route", "roleError", "permissionsError"] as const)("revalida permisos de navegación actuales (%s)", async (change) => {
    state.data!.errors = { quotes: "private secret" };
    const { rerender } = render(<GlobalSearch />);
    await search("445");
    if (change === "route") state.routeQuotes = "none";
    else state[change] = true;
    rerender(<GlobalSearch />);
    expect(screen.queryByText(/COT-0445/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo buscar en/)).not.toBeInTheDocument();
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("muestra error total seguro y retry; nunca falso vacío, tampoco durante reintento", async () => {
    state.data = undefined; state.error = true;
    const { rerender } = render(<GlobalSearch />);
    await search("zz-no-match");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo completar la búsqueda");
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar búsqueda" }));
    expect(state.retry).toHaveBeenCalledOnce();
    state.fetching = true; rerender(<GlobalSearch />);
    expect(screen.getByRole("button", { name: "Reintentar búsqueda" })).toBeDisabled();
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
  });

  it("mantiene resultados parciales y retry sin revelar detalles de errores", async () => {
    state.data!.errors = { quotes: "private DB table secret customer", invoices: "private finances" };
    const { rerender } = render(<GlobalSearch />);
    await search("445");
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo buscar en: Cotizaciones");
    expect(screen.getByRole("status")).not.toHaveTextContent("Facturas");
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "COT-0445 Cliente antiguo" })).toBeInTheDocument();
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar búsqueda" }));
    expect(state.retry).toHaveBeenCalledOnce();
    state.fetching = true; rerender(<GlobalSearch />);
    expect(screen.getByRole("button", { name: "Reintentar búsqueda" })).toBeDisabled();
  });

  it("un parcial vacío no dice Sin resultados", async () => {
    state.data = { ...empty(), errors: { quotes: "secret" } };
    render(<GlobalSearch />);
    await search("zz-no-match");
    expect(screen.getByRole("status")).toHaveTextContent("Cotizaciones");
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
  });

  it.each(["fetch", "pending", "debounce"])("no muestra vacío mientras espera %s", async (pending) => {
    state.data = empty();
    if (pending === "fetch") state.fetching = true;
    else if (pending === "pending") state.pending = true;
    else state.debounce = "";
    render(<GlobalSearch />);
    await search("zz-no-match");
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
  });

  it("muestra vacío sólo al terminar sin errores", async () => {
    state.data = empty();
    render(<GlobalSearch />);
    await search("zz-no-match");
    expect(screen.getByText("Sin resultados.")).toBeInTheDocument();
  });
});
