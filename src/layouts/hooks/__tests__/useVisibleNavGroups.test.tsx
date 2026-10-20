/**
 * Tramo 9 multiempresa: la entrada "Empresas" (operación de plataforma) sólo
 * aparece cuando el servidor confirma al operador. Sin dato o `false` → oculta.
 * Esto es visibilidad; la autorización real es `requirePlatformOperator`.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const operatorState = vi.hoisted(() => ({ data: undefined as boolean | undefined }));
const roleState = vi.hoisted(() => ({ role: "admin" }));

vi.mock("@/features/platform", () => ({
  usePlatformOperatorStatus: () => operatorState,
  ORGANIZATION_WORKSPACE: "/?workspace=organization",
}));

vi.mock("@/features/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/users")>();
  const fullAccess = Object.fromEntries(
    Array.from(new Set(Object.values(actual.ROUTE_TO_MODULE))).map((module) => [module, "full"]),
  );
  return {
    ...actual,
    useUserRole: () => ({ data: roleState.role }),
    useRolePermissions: () => ({ data: { admin: fullAccess, dispatcher: fullAccess } }),
  };
});

import { useVisibleNavGroups } from "../useVisibleNavGroups";

function visibleUrls(): string[] {
  const { result } = renderHook(() => useVisibleNavGroups());
  return result.current.flatMap((group) => group.items.map((item) => item.url));
}

describe("useVisibleNavGroups — operación de plataforma", () => {
  afterEach(() => {
    operatorState.data = undefined;
    roleState.role = "admin";
  });

  it("oculta /platform mientras no hay confirmación del servidor", () => {
    operatorState.data = undefined;
    const urls = visibleUrls();
    expect(urls).toContain("/settings/operations");
    expect(urls).not.toContain("/platform");
  });

  it("oculta /platform a un admin que no es operador", () => {
    operatorState.data = false;
    expect(visibleUrls()).not.toContain("/platform");
  });

  it("muestra el centro sólo al operador y conserva el destino del Panel empresarial", () => {
    operatorState.data = true;
    const { result } = renderHook(() => useVisibleNavGroups());
    const items = result.current.flatMap((group) => group.items);
    expect(items.map((item) => item.url)).toContain("/platform");
    expect(items.find((item) => item.url === "/")?.destination).toBe("/?workspace=organization");
  });
});


it("hides all financial navigation for dispatcher despite a stale full matrix", () => {
  roleState.role = "dispatcher";
  const urls = visibleUrls();
  for (const url of ["/invoices", "/invoices/reconciliation", "/income-statement",
    "/cuentas-por-pagar", "/flujo-de-caja", "/cuentas-bancarias", "/conciliacion-bancaria", "/mrr"]) {
    expect(urls).not.toContain(url);
  }
  for (const url of ["/", "/calendar", "/bookings", "/deliveries", "/returns", "/reports"]) {
    expect(urls).toContain(url);
  }
});
