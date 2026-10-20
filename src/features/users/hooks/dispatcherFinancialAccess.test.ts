import { describe, expect, it } from "vitest";
import {
  DISPATCHER_FINANCIAL_MODULES, getAccessLevel, getRouteAccessLevel,
  hasFinancialAccess, type PermissionsMap,
} from "./useRolePermissions";

const modules = [...DISPATCHER_FINANCIAL_MODULES, "Reportes", "Reservas", "Entregas", "Calendario"];
const legacyFull = Object.fromEntries(modules.map((module) => [module, "full" as const]));
const perms: PermissionsMap = {
  dispatcher: legacyFull, admin: legacyFull, administrativo: legacyFull,
  auditor: Object.fromEntries(modules.map((module) => [module, "read" as const])),
};

describe("dispatcher financial boundary", () => {
  it.each(DISPATCHER_FINANCIAL_MODULES)("denies stale/full dispatcher permission for %s", (module) => {
    expect(getAccessLevel(perms, "dispatcher", module)).toBe("none");
    expect(getAccessLevel(perms, "admin", module)).toBe("full");
    expect(getAccessLevel(perms, "administrativo", module)).toBe("full");
    expect(getAccessLevel(perms, "auditor", module)).toBe("read");
  });
  it.each(["Reportes", "Reservas", "Entregas", "Calendario"])("preserves operational %s", (module) => {
    expect(getAccessLevel(perms, "dispatcher", module)).toBe("full");
  });
  it.each([
    "/invoices", "/invoices/new", "/invoices/example", "/invoices/example/edit",
    "/invoices/reconciliation", "/income-statement", "/mrr", "/expenses",
    "/cuentas-por-pagar", "/cuentas-por-pagar/antiguedad", "/flujo-de-caja",
    "/cuentas-bancarias", "/conciliacion-bancaria", "/conciliacion-bancaria/historial",
  ])("denies financial route %s without changing other roles", (path) => {
    expect(getRouteAccessLevel(perms, "dispatcher", path)).toBe("none");
    expect(getRouteAccessLevel(perms, "administrativo", path)).toBe("full");
  });
  it("retains operational reports and nested booking routes", () => {
    expect(getRouteAccessLevel(perms, "dispatcher", "/reports?type=utilization")).toBe("full");
    expect(getRouteAccessLevel(perms, "dispatcher", "/bookings/example")).toBe("full");
    expect(getRouteAccessLevel(perms, "dispatcher", "/returns")).toBe("full");
  });
  it("financial exclusion fails closed without role and never grants a module", () => {
    expect(hasFinancialAccess(undefined)).toBe(false);
    expect(hasFinancialAccess(null)).toBe(false);
    expect(hasFinancialAccess("dispatcher")).toBe(false);
    expect(hasFinancialAccess("admin")).toBe(true);
    expect(getAccessLevel(undefined, "admin", "Facturas")).toBe("none");
    expect(getRouteAccessLevel(perms, undefined, "/income-statement")).toBe("none");
  });
});
