import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { useInvoicesFilters } from "../useInvoicesFilters";

const wrapper = (initial: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
);

describe("useInvoicesFilters", () => {
  it("reads search/status/date range from URL", () => {
    const { result } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid&from=2026-01-01&to=2026-01-31"),
    });
    expect(result.current.search).toBe("abc");
    expect(result.current.statusFilter).toBe("paid");
    expect(result.current.dateRange?.from).toBeInstanceOf(Date);
    expect(result.current.dateRange?.to).toBeInstanceOf(Date);
    expect(result.current.hasActive).toBe(true);
  });

  it("clearAll wipes all filters and marks hasActive=false", () => {
    const { result } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid"),
    });
    expect(result.current.hasActive).toBe(true);
    act(() => result.current.clearAll());
    expect(result.current.search).toBe("");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.hasActive).toBe(false);
  });

  it("filterKey stays stable across renders when inputs don't change", () => {
    const { result, rerender } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid"),
    });
    const first = result.current.filterKey;
    rerender();
    expect(result.current.filterKey).toBe(first);
  });
});
