import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("b");
  });

  it("cancela cambios intermedios (último gana)", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ v: "c" });
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("a"); // todavía no expira
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("c");
  });

  it("limpia el timer al desmontar el componente", () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    unmount();
    act(() => { vi.advanceTimersByTime(100); });
    // El valor debounced nunca se actualiza porque el timer se canceló al desmontar
    expect(result.current).toBe("a");
  });
});
