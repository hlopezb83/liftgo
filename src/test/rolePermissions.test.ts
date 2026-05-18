import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

async function waitUntil(predicate: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("waitUntil timeout");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { getAccessLevel, type PermissionsMap } from "@/features/users/hooks/useRolePermissions";

// ---- Supabase + Auth mocks ----
const selectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) => selectMock(),
      }),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-non-admin" } }),
}));

import { useUserRole } from "@/features/users/hooks/useUserRole";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useUserRole — RLS visibility of own role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("non-admin user can read own role (administrativo)", async () => {
    selectMock.mockResolvedValue({ data: [{ role: "administrativo" }], error: null });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    await waitUntil(() => !result.current.isFetching);
    expect(result.current.data).toBe("administrativo");
  });

  it("returns null (no silent demotion) when RLS blocks read and returns []", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    await waitUntil(() => !result.current.isFetching);
    expect(result.current.data).toBeNull();
    expect(result.current.isFetching).toBe(false);
  });

  it("picks the highest-priority role when user has multiple", async () => {
    selectMock.mockResolvedValue({
      data: [{ role: "dispatcher" }, { role: "admin" }, { role: "ventas" }],
      error: null,
    });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    await waitUntil(() => !result.current.isFetching);
    expect(result.current.data).toBe("admin");
  });

  it("propagates errors instead of defaulting to dispatcher", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "RLS denied" } });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    // useUserRole usa retry: 2 con backoff; esperamos hasta que se asiente.
    await waitUntil(() => result.current.isError === true, 10000);
    expect(result.current.isError).toBe(true);
    expect(result.current.data).not.toBe("dispatcher");
  }, 15000);
});

describe("RoleGuard access enforcement via getAccessLevel", () => {
  const perms: PermissionsMap = {
    admin: { Facturas: "full", "Gestión de Usuarios": "full", Reportes: "full" },
    administrativo: { Facturas: "full", "Gestión de Usuarios": "none", Reportes: "read" },
    ventas: { Facturas: "none", Cotizaciones: "full" },
    dispatcher: { Facturas: "read", Mantenimiento: "none" },
    mechanic: { Mantenimiento: "full", Facturas: "none" },
    auditor: { Facturas: "read", "Gestión de Usuarios": "read" },
  };

  it("administrativo has full access to Facturas (can generate recurring)", () => {
    expect(getAccessLevel(perms, "administrativo", "Facturas")).toBe("full");
  });

  it("administrativo cannot access Gestión de Usuarios", () => {
    expect(getAccessLevel(perms, "administrativo", "Gestión de Usuarios")).toBe("none");
  });

  it("ventas cannot access Facturas", () => {
    expect(getAccessLevel(perms, "ventas", "Facturas")).toBe("none");
  });

  it("dispatcher has read-only on Facturas (cannot generate recurring)", () => {
    expect(getAccessLevel(perms, "dispatcher", "Facturas")).toBe("read");
  });

  it("mechanic has full Mantenimiento, no Facturas", () => {
    expect(getAccessLevel(perms, "mechanic", "Mantenimiento")).toBe("full");
    expect(getAccessLevel(perms, "mechanic", "Facturas")).toBe("none");
  });

  it("returns 'none' for unknown role or undefined inputs", () => {
    expect(getAccessLevel(undefined, "admin", "Facturas")).toBe("none");
    expect(getAccessLevel(perms, undefined, "Facturas")).toBe("none");
    expect(getAccessLevel(perms, "admin", "ModuloInexistente")).toBe("none");
  });
});
