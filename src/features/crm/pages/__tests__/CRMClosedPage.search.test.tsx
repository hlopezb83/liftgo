import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { ReactNode } from "react";
import type { Prospect } from "../../hooks/useProspects";
import CRMClosedPage from "../CRMClosedPage";

const state = vi.hoisted(() => ({ empty: false, loading: false, error: false }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/layout/PageTransition", () => ({ PageTransition: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/router-compat-ui", () => ({ Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("../../hooks/useCRMMetrics", () => ({ useCRMMetrics: () => ({
  data: {
    won: state.empty ? [] : [{ id: "won-1", companyName: "Empresa ganada", contactPerson: "Contacto", dealValue: 100 } as Prospect],
    lost: state.empty ? [] : [{ id: "lost-1", companyName: "Empresa perdida", contactPerson: "Contacto", dealValue: 100 } as Prospect],
    winRate30d: 50, wonCountMTD: 1, wonTotalMTD: 100, lostCountMTD: 1,
  },
  isLoading: state.loading, isError: state.error, refetch: vi.fn(),
}) }));

beforeEach(() => { state.empty = false; state.loading = false; state.error = false; });
afterEach(cleanup);

describe("CRMClosedPage: resultados de búsqueda", () => {
  it.each(["Ganados", "Perdidos"])("muestra coincidencias en %s y restaura los totales al limpiar la búsqueda", (tab) => {
    render(<CRMClosedPage />, { wrapper: createQueryWrapper().Wrapper });
    fireEvent.mouseDown(screen.getByRole("tab", { name: `${tab} (1)` }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByPlaceholderText("Buscar empresa o contacto…"), { target: { value: "No coincide" } });
    expect(screen.getByText("No hay prospectos que coincidan con la búsqueda")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay registros aquí.")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ganados (0 de 1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Perdidos (0 de 1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(screen.getByPlaceholderText("Buscar empresa o contacto…")).toHaveValue("");
    expect(screen.getByRole("tab", { name: "Ganados (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Perdidos (1)" })).toBeInTheDocument();
    expect(screen.getByText(tab === "Ganados" ? "Empresa ganada" : "Empresa perdida")).toBeInTheDocument();
  });

  it("mantiene el vacío real y no lo muestra durante carga o error", () => {
    state.empty = true;
    const view = render(<CRMClosedPage />, { wrapper: createQueryWrapper().Wrapper });
    expect(screen.getByText("Sin registros.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar empresa o contacto…"), { target: { value: "Pendiente" } });
    state.loading = true;
    view.rerender(<CRMClosedPage />);
    expect(screen.queryByText("No hay prospectos que coincidan con la búsqueda")).not.toBeInTheDocument();
    state.loading = false; state.error = true;
    view.rerender(<CRMClosedPage />);
    expect(screen.getByText("No se pudo cargar el historial de prospectos cerrados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).not.toBeInTheDocument();
  });
});
