import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

describe("usePullToRefresh", () => {
  it("expone la API pública {pullDistance, isRefreshing, threshold}", () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn(), target: null }),
    );
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.threshold).toBe(70);
  });

  it("respeta el threshold custom", () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn(), target: null, threshold: 120 }),
    );
    expect(result.current.threshold).toBe(120);
  });

  it("es no-op cuando target es null (hook inactivo)", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, target: null }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("es no-op cuando enabled=false aunque haya target", () => {
    const el = document.createElement("div");
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, target: el, enabled: false }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });
});
