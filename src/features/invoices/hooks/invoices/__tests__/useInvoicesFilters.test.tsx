import { beforeEach, describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import type { ReactNode } from "react";
import { useInvoicesFilters } from "../useInvoicesFilters";

const wrapper = (initial: string) => ({ children }: { children: ReactNode }) => (
  <TestRouter initialEntries={[initial]}>{children}</TestRouter>
);

describe("useInvoicesFilters", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("persists the full origin URL filters for detail return navigation", async () => {
    const params = "q=cliente&status=sent&cfdi=stamped&from=2026-10-01&to=2026-10-31";
    const { result } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper(`/invoices?${params}`),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(window.sessionStorage.getItem("list-filters:/invoices")).toBe(params);
    act(() => result.current.clearAll());
    await waitFor(() => expect(window.sessionStorage.getItem("list-filters:/invoices")).toBeNull());
  });

  it("reads search/status/date range from URL", async () => {
    const { result } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid&from=2026-01-01&to=2026-01-31"),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.search).toBe("abc");
    expect(result.current.statusFilter).toBe("paid");
    expect(result.current.dateRange?.from).toBeInstanceOf(Date);
    expect(result.current.dateRange?.to).toBeInstanceOf(Date);
    expect(result.current.hasActive).toBe(true);
  });

  it("clearAll wipes all filters and marks hasActive=false", async () => {
    const { result } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid"),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.hasActive).toBe(true);
    act(() => result.current.clearAll());
    expect(result.current.search).toBe("");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.hasActive).toBe(false);
  });

  it("filterKey stays stable across renders when inputs don't change", async () => {
    const { result, rerender } = renderHook(() => useInvoicesFilters(), {
      wrapper: wrapper("/invoices?q=abc&status=paid"),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    const first = result.current.filterKey;
    rerender();
    expect(result.current.filterKey).toBe(first);
  });
});
