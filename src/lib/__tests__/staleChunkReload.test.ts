import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearStaleChunkReloadGuard, isStaleChunkMessage, recoverFromStaleChunk, reloadForStaleChunk } from "@/lib/staleChunkReload";

const KEY = "vite-preload-reload";

describe("staleChunkReload (M-22)", () => {
  const reload = vi.fn();

  beforeEach(() => {
    clearStaleChunkReloadGuard();
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite hasta 2 recargas dentro de la ventana y luego se rinde", () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reinicia el contador pasada la ventana de 30 s", () => {
    reloadForStaleChunk();
    reloadForStaleChunk();
    vi.setSystemTime(new Date("2026-08-12T12:00:31Z"));
    expect(reloadForStaleChunk()).toBe(true);
  });

  it("clearStaleChunkReloadGuard borra el estado persistido", () => {
    reloadForStaleChunk();
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    clearStaleChunkReloadGuard();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("ignora estado corrupto en sessionStorage", () => {
    sessionStorage.setItem(KEY, "no-json");
    expect(reloadForStaleChunk()).toBe(true);
  });
  it("reconoce el fallo reportado de módulo default y mantiene el límite de recargas", () => {
    const message = "Cannot read properties of undefined (reading 'default')";
    expect(isStaleChunkMessage(message)).toBe(true);
    if (isStaleChunkMessage(message)) {
      expect(reloadForStaleChunk()).toBe(true);
      expect(reloadForStaleChunk()).toBe(true);
      expect(reloadForStaleChunk()).toBe(false);
    }
    expect(reload).toHaveBeenCalledTimes(2);
    expect(isStaleChunkMessage("Cannot read properties of undefined (reading 'total')")).toBe(false);
  });
  it("reconoce la pantalla dividida sin `component` y reutiliza la recarga pendiente", () => {
    expect(isStaleChunkMessage("Cannot read properties of undefined (reading 'component')")).toBe(true);
    expect(isStaleChunkMessage("undefined is not an object (evaluating 'e.component')")).toBe(true);
    expect(isStaleChunkMessage("Cannot read properties of undefined (reading 'components')")).toBe(false);
    expect(recoverFromStaleChunk("Cannot read properties of undefined (reading 'component')")).toBe(true);
    expect(recoverFromStaleChunk("ChunkLoadError")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? "{}").count).toBe(1);
    expect(recoverFromStaleChunk("Fallo de consulta")).toBe(false);
  });
});
