import { renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useInitialRecordVersion } from "../useInitialRecordVersion";

type VersionProps = { id?: string; loadedId?: string; version?: number | null };
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const useVersion = ({ id, loadedId, version }: VersionProps) => useInitialRecordVersion(id, loadedId, version);

describe("useInitialRecordVersion", () => {
  it("captura datos disponibles al abrir y conserva el candado ante un refetch", () => {
    const { result, rerender } = renderHook(useVersion, {
      initialProps: { id: "A", loadedId: "A", version: 4 }, wrapper,
    });
    expect(result.current).toBe(4);
    rerender({ id: "A", loadedId: "A", version: 5 });
    expect(result.current).toBe(4);
  });

  it("espera la primera versión válida y conserva cero como versión", () => {
    const { result, rerender } = renderHook(useVersion, {
      initialProps: { id: "A" } as VersionProps, wrapper,
    });
    expect(result.current).toBeNull();
    rerender({ id: "A", loadedId: "A", version: null });
    expect(result.current).toBeNull();
    rerender({ id: "A", loadedId: "A", version: 0 });
    rerender({ id: "A", loadedId: "A", version: 1 });
    expect(result.current).toBe(0);
  });

  it("al cambiar de ruta descarta la versión anterior y rechaza datos del registro viejo", () => {
    const { result, rerender } = renderHook(useVersion, {
      initialProps: { id: "A", loadedId: "A", version: 4 }, wrapper,
    });
    rerender({ id: "B", loadedId: "A", version: 4 });
    expect(result.current).toBeNull();
    rerender({ id: "B", loadedId: "B", version: 7 });
    expect(result.current).toBe(7);
  });

  it("captura inmediatamente la nueva ruta si sus datos ya están en caché", () => {
    const { result, rerender } = renderHook(useVersion, {
      initialProps: { id: "A", loadedId: "A", version: 4 }, wrapper,
    });
    rerender({ id: "B", loadedId: "B", version: 7 });
    expect(result.current).toBe(7);
  });

  it("limpia el candado al pasar a alta y vuelve a capturar al regresar a edición", () => {
    const { result, rerender } = renderHook(useVersion, {
      initialProps: { id: "A", loadedId: "A", version: 4 } as VersionProps, wrapper,
    });
    rerender({ loadedId: "A", version: 5 });
    expect(result.current).toBeNull();
    rerender({ id: "A", loadedId: "A", version: 5 });
    expect(result.current).toBe(5);
  });

  it("conserva updated_at para equipos y lo renueva al abrir un formulario nuevo", () => {
    const initial = "2026-09-24T10:00:00Z";
    const refreshed = "2026-09-24T11:00:00Z";
    const first = renderHook(({ version }) => useInitialRecordVersion("A", "A", version), {
      initialProps: { version: initial }, wrapper,
    });
    first.rerender({ version: refreshed });
    expect(first.result.current).toBe(initial);
    first.unmount();
    const reopened = renderHook(() => useInitialRecordVersion("A", "A", refreshed), { wrapper });
    expect(reopened.result.current).toBe(refreshed);
  });
});
