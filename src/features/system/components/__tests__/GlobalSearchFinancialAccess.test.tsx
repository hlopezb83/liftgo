import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ canSeeFinancials: false, role: undefined as string | undefined,
  permissions: undefined as Record<string, Record<string, "full" | "read" | "none">> | undefined,
  loading: false, roleError: false, permissionsError: false, navigate: vi.fn(), preload: vi.fn() }));
vi.mock("@/features/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/users")>();
  const full = Object.fromEntries(actual.MODULES.map((module) => [module, "full"]));
  return {
    ...actual,
    useHasFinancialAccess: () => state.canSeeFinancials,
    useUserRole: () => ({ isError: state.roleError, data: state.loading ? undefined : state.role ?? (state.canSeeFinancials ? "admin" : "dispatcher") }),
    useRolePermissions: () => ({ isError: state.permissionsError, data: state.loading ? undefined : state.permissions ?? {
      admin: full, dispatcher: { ...full, Configuración: "none", "Gestión de Usuarios": "none" },
    } }),
  };
});
vi.mock("@/app-routes/routes-config", () => ({ routeLoaders: { "/users": state.preload } }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
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
  CommandItem: ({ children, onSelect, onMouseEnter }: { children: ReactNode; onSelect: () => void; onMouseEnter?: () => void }) =>
    <button onClick={onSelect} onMouseEnter={onMouseEnter}>{children}</button>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { GlobalSearch } from "../GlobalSearch";

beforeEach(() => {
  state.canSeeFinancials = false; state.role = undefined; state.permissions = undefined; state.loading = false; state.roleError = false; state.permissionsError = false;
  state.navigate.mockClear(); state.preload.mockClear();
});

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


describe("GlobalSearch — permisos de navegación compartidos", () => {
  it("oculta administración al despachador sin eliminar operación ni ayuda", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    for (const label of ["Datos fiscales", "Configuración operativa", "Usuarios"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    expect(state.preload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reservas" }));
    expect(state.navigate).toHaveBeenCalledWith("/bookings");
  });

  it("conserva módulos con acceso read y páginas públicas aunque el resto esté denegado", () => {
    state.canSeeFinancials = true; state.role = "auditor";
    state.permissions = { auditor: { Configuración: "read", "Gestión de Usuarios": "read" } };
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    for (const label of ["Datos fiscales", "Configuración operativa", "Usuarios", "Ayuda", "Historial de cambios"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Reservas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cliente operativo")).not.toBeInTheDocument();
    expect(screen.queryByText("FAC-SECRET")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Usuarios" }));
    expect(state.preload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Usuarios" }));
    expect(state.navigate).toHaveBeenCalledWith("/users");
  });

  it("retira enlaces al cambiar de rol o perder la matriz con el diálogo abierto", () => {
    state.canSeeFinancials = true;
    const { rerender } = render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    expect(screen.getByRole("button", { name: "Usuarios" })).toBeInTheDocument();
    state.canSeeFinancials = false;
    rerender(<GlobalSearch />);
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservas" })).toBeInTheDocument();
    expect(screen.getByText("Cliente operativo")).toBeInTheDocument();
    state.loading = true;
    rerender(<GlobalSearch />);
    expect(screen.queryByRole("button", { name: "Reservas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cliente operativo")).not.toBeInTheDocument();
  });
});


it.each(["roleError", "permissionsError"] as const)("hides stale privileged destinations when %s occurs", (error) => {
  state.canSeeFinancials = true;
  const { rerender } = render(<GlobalSearch />);
  fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
  expect(screen.getByRole("button", { name: "Usuarios" })).toBeInTheDocument();
  state[error] = true;
  rerender(<GlobalSearch />);
  for (const label of ["Usuarios", "Facturas", "Reservas", "Cliente operativo", "FAC-SECRET"]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});
