/**
 * Tramo 9 multiempresa: la entrada "Empresas" (operación de plataforma) sólo
 * aparece cuando el servidor confirma al operador. Sin dato o `false` → oculta.
 * Esto es visibilidad; la autorización real es `requirePlatformOperator`.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const operatorState = vi.hoisted(() => ({ data: undefined as boolean | undefined }));

vi.mock("@/features/platform/hooks/usePlatformOperator", () => ({
  usePlatformOperatorStatus: () => operatorState,
}));

vi.mock("@/features/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/users")>();
  const fullAccess = Object.fromEntries(
    Array.from(new Set(Object.values(actual.ROUTE_TO_MODULE))).map((module) => [module, "full"]),
  );
  return {
    ...actual,
    useUserRole: () => ({ data: "admin" }),
    useRolePermissions: () => ({ data: { admin: fullAccess } }),
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
  });

  it("oculta /settings/organizations mientras no hay confirmación del servidor", () => {
    operatorState.data = undefined;
    const urls = visibleUrls();
    expect(urls).toContain("/settings/operations");
    expect(urls).not.toContain("/settings/organizations");
  });

  it("oculta /settings/organizations a un admin que no es operador", () => {
    operatorState.data = false;
    expect(visibleUrls()).not.toContain("/settings/organizations");
  });

  it("muestra /settings/organizations sólo al operador confirmado", () => {
    operatorState.data = true;
    expect(visibleUrls()).toContain("/settings/organizations");
  });
});
