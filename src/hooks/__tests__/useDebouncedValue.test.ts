import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve el valor inicial inmediatamente", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 200));
    expect(result.current).toBe("a");
  });

  it("retrasa la actualización al delay configurado", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    expect(result.current).toBe("a");
    vi.advanceTimersByTime(199);
    expect(result.current).toBe("a");
    vi.advanceTimersByTime(1);
    expect(result.current).toBe("b");
  });

  it("cancela cambios intermedios (último gana)", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    vi.advanceTimersByTime(50);
    rerender({ v: "c" });
    vi.advanceTimersByTime(50);
    expect(result.current).toBe("a"); // todavía no expira
    vi.advanceTimersByTime(50);
    expect(result.current).toBe("c");
  });
});
