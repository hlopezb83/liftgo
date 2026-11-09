import { describe, expect, it } from "vitest";
import { ALWAYS_VISIBLE_ROUTES, getNavigationAccessLevel, getRouteAccessLevel, type AccessLevel, type PermissionsMap } from "./useRolePermissions";

const permissions: PermissionsMap = {
  dispatcher: { Configuración: "none", "Gestión de Usuarios": "none", Reservas: "full" },
  auditor: { Configuración: "read", "Gestión de Usuarios": "read", Reservas: "none" },
};

describe("shared navigation permissions", () => {
  it.each(["/settings/company", "/settings/operations", "/users", "/users/permissions?tab=roles"])("respects the matrix for %s", (path) => {
    expect(getNavigationAccessLevel(permissions, "dispatcher", path)).toBe("none");
    expect(getNavigationAccessLevel(permissions, "auditor", path)).toBe("read");
  });
  it.each(ALWAYS_VISIBLE_ROUTES)("preserves support page %s", (path) => {
    expect(getNavigationAccessLevel(permissions, "dispatcher", path)).toBe("full");
  });
  it("fails closed without role or permissions or a known route", () => {
    expect(getNavigationAccessLevel(undefined, "dispatcher", "/bookings")).toBe("none");
    expect(getNavigationAccessLevel(permissions, undefined, "/bookings")).toBe("none");
    expect(getNavigationAccessLevel(permissions, "dispatcher", "/unmapped")).toBe("none");
    expect(getNavigationAccessLevel(permissions, "dispatcher", "/bookings/123")).toBe("full");
  });
});


describe("expenses legacy alias permissions", () => {
  const cases: { expenses: AccessLevel; payable: AccessLevel; expected: AccessLevel }[] = [
    { expenses: "none", payable: "read", expected: "read" },
    { expenses: "read", payable: "none", expected: "none" },
    { expenses: "none", payable: "none", expected: "none" },
    { expenses: "read", payable: "read", expected: "read" },
  ];

  it.each(cases)("uses CxP permission when Gastos=$expenses and CxP=$payable", ({ expenses, payable, expected }) => {
    const perms: PermissionsMap = { auditor: { Gastos: expenses, "Facturas de Proveedor": payable } };
    for (const path of ["/expenses", "/expenses?from=legacy#list", "/cuentas-por-pagar"]) {
      expect(getRouteAccessLevel(perms, "auditor", path)).toBe(expected);
      expect(getNavigationAccessLevel(perms, "auditor", path)).toBe(expected);
    }
  });

  it("keeps the financial boundary for dispatcher even with stale full grants", () => {
    const perms: PermissionsMap = { dispatcher: { Gastos: "full", "Facturas de Proveedor": "full" } };
    for (const path of ["/expenses", "/cuentas-por-pagar"]) {
      expect(getRouteAccessLevel(perms, "dispatcher", path)).toBe("none");
      expect(getNavigationAccessLevel(perms, "dispatcher", path)).toBe("none");
    }
  });
});
