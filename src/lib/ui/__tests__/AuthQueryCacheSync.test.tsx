import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AuthContext with a mutable provider for testing
let currentUser: { id: string } | null = { id: "user-1" };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentUser }),
}));

import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";

interface TestWrapperProps {
  queryClient: QueryClient;
}

// Nota: `currentUser` se muta desde el test antes de renderizar (ver `renderWith`).
// Este wrapper es puro: sólo lee el mock ya configurado.
function TestWrapper({ queryClient }: TestWrapperProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryCacheSync />
    </QueryClientProvider>
  );
}

function renderWith(user: { id: string } | null, queryClient: QueryClient) {
  currentUser = user;
  return render(<TestWrapper queryClient={queryClient} />);
}

function rerenderWith(
  rerender: (ui: ReactElement) => void,
  user: { id: string } | null,
  queryClient: QueryClient,
) {
  currentUser = user;
  rerender(<TestWrapper queryClient={queryClient} />);
}

describe("AuthQueryCacheSync", () => {
  beforeEach(() => {
    currentUser = { id: "user-1" };
  });

  it("does NOT clear cache on initial mount", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWith(currentUser, qc);
    qc.setQueryData(["forklifts", "list"], [{ id: "f1" }]);

    expect(qc.getQueryData(["forklifts", "list"])).toBeDefined();
  });

  it("purga los datos de la sesión anterior cuando cambia el usuario", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderWith({ id: "user-1" }, qc);

    qc.setQueryData(["forklifts", "list"], [{ id: "f1" }]);
    qc.setQueryData(["organization-context", "user-1"], { organizationId: "org-a" });

    rerenderWith(rerender, { id: "user-2" }, qc);

    expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined();
    // La consulta de identidad se conserva: volver a limpiarla dejaría la
    // verificación de empresa en bucle.
    expect(qc.getQueryData(["organization-context", "user-1"])).toBeDefined();
  });

  it("purga los datos al cerrar sesión (user pasa a null)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderWith({ id: "user-1" }, qc);

    qc.setQueryData(["forklifts", "list"], [{ id: "f1" }]);

    rerenderWith(rerender, null, qc);

    expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined();
  });
});
