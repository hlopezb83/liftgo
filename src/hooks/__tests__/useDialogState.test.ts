import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDialogState, useToggleDialog } from "@/hooks/useDialogState";

describe("useDialogState", () => {
  it("inicia cerrado y sin selección", () => {
    const { result } = renderHook(() => useDialogState<{ id: string }>());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  it("open(value) selecciona y marca abierto", () => {
    const { result } = renderHook(() => useDialogState<{ id: string }>());
    act(() => result.current.open({ id: "abc" }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.selected).toEqual({ id: "abc" });
  });

  it("close() limpia la selección", () => {
    const { result } = renderHook(() => useDialogState<{ id: string }>());
    act(() => result.current.open({ id: "x" }));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  it("onOpenChange(false) cierra; onOpenChange(true) no abre sin valor", () => {
    const { result } = renderHook(() => useDialogState<{ id: string }>());
    act(() => result.current.open({ id: "x" }));
    act(() => result.current.onOpenChange(false));
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.onOpenChange(true));
    expect(result.current.isOpen).toBe(false);
  });
});

describe("useToggleDialog", () => {
  it("respeta valor inicial", () => {
    const { result } = renderHook(() => useToggleDialog(true));
    expect(result.current.open).toBe(true);
  });

  it("openDialog y closeDialog togglean estado", () => {
    const { result } = renderHook(() => useToggleDialog());
    expect(result.current.open).toBe(false);
    act(() => result.current.openDialog());
    expect(result.current.open).toBe(true);
    act(() => result.current.closeDialog());
    expect(result.current.open).toBe(false);
  });
});
