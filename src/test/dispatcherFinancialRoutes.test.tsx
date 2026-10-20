import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

// Use actual route components and actual permission resolution/RoleGuard.
// Only router registration and the session/data boundary are mocked.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
}));
vi.mock("@/layouts/NoAccess", () => ({ NoAccess: () => <div>No financial access</div> }));
vi.mock("@/features/users", async (original) => {
  const actual = await original<typeof import("@/features/users")>();
  return {
    ...actual,
    useUserRole: () => ({ data: "dispatcher", isLoading: false, isError: false }),
    useRolePermissions: () => ({
      data: { dispatcher: Object.fromEntries(actual.MODULES.map((module) => [module, "full"])) },
      isLoading: false, isError: false,
    }),
  };
});

const routes = [
  ["invoice list", () => import("../routes/_main/invoices.index")],
  ["invoice detail", () => import("../routes/_main/invoices.$id.index")],
  ["new invoice", () => import("../routes/_main/invoices.new")],
  ["edit invoice", () => import("../routes/_main/invoices.$id.edit")],
  ["CFDI reconciliation", () => import("../routes/_main/invoices.reconciliation")],
  ["income statement", () => import("../routes/_main/income-statement")],
  ["MRR", () => import("../routes/_main/mrr")],
  ["cash flow", () => import("../routes/_main/flujo-de-caja")],
  ["bank accounts", () => import("../routes/_main/cuentas-bancarias")],
  ["bank reconciliation", () => import("../routes/_main/conciliacion-bancaria.index")],
  ["bank history", () => import("../routes/_main/conciliacion-bancaria.historial")],
  ["supplier invoices", () => import("../routes/_main/cuentas-por-pagar.index")],
  ["supplier aging", () => import("../routes/_main/cuentas-por-pagar.antiguedad")],
] as const;

describe("financial direct routes under a stale dispatcher full matrix", () => {
  it.each(routes)("denies %s before the lazy page mounts", async (_name, load) => {
    const { Route } = await load();
    const Component = Route.options.component as ComponentType;
    render(<Component />);
    expect(screen.getByText("No financial access")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }, 30_000);
});
