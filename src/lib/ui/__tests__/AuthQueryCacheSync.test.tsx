import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  rerender: (ui: React.ReactElement) => void,
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
    const clearSpy = vi.spyOn(qc, "clear");

    renderWith(currentUser, qc);

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears cache when user changes", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = renderWith({ id: "user-1" }, qc);

    expect(clearSpy).not.toHaveBeenCalled();

    rerenderWith(rerender, { id: "user-2" }, qc);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it("clears cache on sign-out (user becomes null)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = renderWith({ id: "user-1" }, qc);

    expect(clearSpy).not.toHaveBeenCalled();

    rerenderWith(rerender, null, qc);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
