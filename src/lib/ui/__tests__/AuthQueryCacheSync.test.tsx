import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock AuthContext before importing AuthQueryCacheSync
const mockUser = { id: "user-1", email: "a@test.com" };
let authUser: { id: string; email: string } | null = mockUser;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {children}
    </QueryClientProvider>
  );
}

describe("AuthQueryCacheSync", () => {
  beforeEach(() => {
    authUser = mockUser;
  });

  it("does NOT clear cache on initial mount", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    renderHook(() => React.createElement(AuthQueryCacheSync), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears cache when user changes", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = renderHook(() => React.createElement(AuthQueryCacheSync), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    // Initial mount should not clear
    expect(clearSpy).not.toHaveBeenCalled();

    // Change user
    authUser = { id: "user-2", email: "b@test.com" };
    rerender();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it("clears cache on sign-out (user becomes null)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = renderHook(() => React.createElement(AuthQueryCacheSync), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    expect(clearSpy).not.toHaveBeenCalled();

    authUser = null;
    rerender();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
