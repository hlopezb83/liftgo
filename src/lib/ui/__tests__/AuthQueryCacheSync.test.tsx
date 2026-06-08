import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";

// Mock AuthContext with a mutable provider for testing
let currentUser: { id: string } | null = { id: "user-1" };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentUser }),
}));

import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";

interface TestWrapperProps {
  user: { id: string } | null;
  queryClient: QueryClient;
}

function TestWrapper({ user, queryClient }: TestWrapperProps) {
  currentUser = user;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryCacheSync />
    </QueryClientProvider>
  );
}

describe("AuthQueryCacheSync", () => {
  beforeEach(() => {
    currentUser = { id: "user-1" };
  });

  it("does NOT clear cache on initial mount", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    render(<TestWrapper user={currentUser} queryClient={qc} />);

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears cache when user changes", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = render(<TestWrapper user={{ id: "user-1" }} queryClient={qc} />);

    expect(clearSpy).not.toHaveBeenCalled();

    rerender(<TestWrapper user={{ id: "user-2" }} queryClient={qc} />);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it("clears cache on sign-out (user becomes null)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, "clear");

    const { rerender } = render(<TestWrapper user={{ id: "user-1" }} queryClient={qc} />);

    expect(clearSpy).not.toHaveBeenCalled();

    rerender(<TestWrapper user={null} queryClient={qc} />);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
