import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/app-routes/routes";
import type { AccessLevel, PermissionsMap } from "@/features/users/hooks/useRolePermissions";
import type { AppRole } from "@/features/users/hooks/useUserRole";

const state = vi.hoisted(() => ({
  role: "auditor" as AppRole,
  expenses: "none" as AccessLevel,
  payable: "read" as AccessLevel,
  navigate: vi.fn(),
}));
vi.mock("@/features/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/users")>();
  return {
    ...actual,
    useHasModuleAccess: () => false,
    useHasFinancialAccess: () => state.role !== "dispatcher",
    useUserRole: () => ({ data: state.role, isError: false }),
    useRolePermissions: () => ({
      data: {
        [state.role]: {
          ...Object.fromEntries(actual.MODULES.map((module) => [module, "none"])),
          Gastos: state.expenses,
          "Facturas de Proveedor": state.payable,
        },
      } satisfies PermissionsMap,
      isError: false,
    }),
  };
});
vi.mock("@/app-routes/routes-config", () => ({ routeLoaders: {} }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => value }));
vi.mock("@/features/system/hooks/useEntitySearch", () => ({
  useEntitySearch: (_query: string, _enabled: boolean, activeQuery: string) => ({ activeQuery,
    data: undefined, isFetching: false, isPending: false, isError: false,
    canSearchEntities: false, isResolvingAccess: false,
  }),
}));
// Keep Command/Dialog real so visibility and selection use the actual cmdk list.
import { GlobalSearch } from "../GlobalSearch";

beforeEach(() => {
  state.role = "auditor";
  state.expenses = "none";
  state.payable = "read";
  state.navigate.mockReset();
});

const cases: { expenses: AccessLevel; payable: AccessLevel; visible: boolean }[] = [
  { expenses: "none", payable: "read", visible: true },
  { expenses: "read", payable: "none", visible: false },
  { expenses: "none", payable: "none", visible: false },
  { expenses: "read", payable: "read", visible: true },
];

describe("GlobalSearch legacy expenses alias", () => {
  it.each(cases)("Gastos=$expenses and CxP=$payable follows the redirect destination", async ({ expenses, payable, visible }) => {
    state.expenses = expenses;
    state.payable = payable;
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    await screen.findByRole("dialog");
    const item = screen.queryByRole("option", { name: "Gastos operativos" });
    if (visible) {
      expect(item).toBeInTheDocument();
      fireEvent.click(item!);
      // Preserve the catalog and public legacy URL; the router handles the redirect.
      expect(ROUTES.expenses).toBe("/expenses");
      await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/expenses"));
    } else {
      expect(item).not.toBeInTheDocument();
      expect(state.navigate).not.toHaveBeenCalled();
    }
  });

  it("hides the alias for dispatcher with stale full financial permissions", async () => {
    state.role = "dispatcher";
    state.expenses = "full";
    state.payable = "full";
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("option", { name: "Gastos operativos" })).not.toBeInTheDocument();
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("removes the alias when CxP access is revoked while the dialog remains open", async () => {
    state.expenses = "read";
    const { rerender } = render(<GlobalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "Navegación rápida" }));
    expect(await screen.findByRole("option", { name: "Gastos operativos" })).toBeInTheDocument();
    state.payable = "none";
    rerender(<GlobalSearch />);
    expect(screen.queryByRole("option", { name: "Gastos operativos" })).not.toBeInTheDocument();
    expect(state.navigate).not.toHaveBeenCalled();
  });
});
