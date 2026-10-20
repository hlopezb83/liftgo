import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ canSeeFinancials: false }));
vi.mock("@/features/users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/users")>(),
  useHasFinancialAccess: () => state.canSeeFinancials,
}));
vi.mock("@/app-routes/routes-config", () => ({ routeLoaders: {} }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => value }));
vi.mock("@/features/system/hooks/useEntitySearch", () => ({
  useEntitySearch: () => ({ data: {
    invoices: [{ id: "i", label: "FAC-SECRET", sub: "Cliente financiero", url: "/invoices/i" }],
    customers: [{ id: "c", label: "Cliente operativo", url: "/customers/c" }],
    bookings: [], deliveries: [], returns: [], errors: { invoices: "Forbidden" },
  } }),
}));
vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  CommandEmpty: () => null,
  CommandGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CommandInput: ({ placeholder }: { placeholder: string }) => <input placeholder={placeholder} />,
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { GlobalSearch } from "../GlobalSearch";

beforeEach(() => { state.canSeeFinancials = false; });

describe("GlobalSearch — exclusión financiera de despachador", () => {
  it("omite rutas y resultados financieros pero conserva navegación y clientes operativos", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    for (const text of ["Facturas", "Gastos operativos", "Estado de resultados", "FAC-SECRET", "Cliente financiero"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/No se pudo buscar en/)).not.toBeInTheDocument();
    expect(screen.getByText("Reservas")).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByText("Cliente operativo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar módulo, cliente o reserva…")).toBeInTheDocument();
  });

  it("conserva finanzas para otros roles y elimina hits anteriores al cambiar a despachador", () => {
    state.canSeeFinancials = true;
    const { rerender } = render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    expect(screen.getByText("FAC-SECRET")).toBeInTheDocument();
    expect(screen.getByText("Estado de resultados")).toBeInTheDocument();
    state.canSeeFinancials = false;
    rerender(<GlobalSearch />);
    expect(screen.queryByText("FAC-SECRET")).not.toBeInTheDocument();
    expect(screen.queryByText("Estado de resultados")).not.toBeInTheDocument();
    expect(screen.getByText("Cliente operativo")).toBeInTheDocument();
  });
});
