import { describe, expect, it } from "vitest";
import { ALWAYS_VISIBLE_ROUTES, getNavigationAccessLevel, type PermissionsMap } from "./useRolePermissions";

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
