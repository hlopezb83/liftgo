import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearStaleChunkReloadGuard, handleStaleChunkPreloadError, isStaleChunkRecoveryPending, isStaleChunkMessage, recoverFromStaleChunk, reloadForStaleChunk } from "@/lib/staleChunkReload";

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
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("permite hasta 2 recargas dentro de la ventana y luego se rinde", () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it.each(["getItem", "setItem"] as const)("no recarga cuando %s falla", (method) => {
    vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), [method]: () => { throw new Error("Storage blocked"); } });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(recoverFromStaleChunk("ChunkLoadError")).toBe(false);
      expect(isStaleChunkRecoveryPending()).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("no recarga si la escritura se descarta sin error", () => {
    vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), setItem: () => undefined });
    expect(reloadForStaleChunk()).toBe(false);
    expect(isStaleChunkRecoveryPending()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([false, true])("con módulos nuevos mantiene el límite (storage bloqueado: %s)", async (blocked) => {
    if (blocked) vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), setItem: () => { throw new Error("Storage blocked"); } });
    for (let attempt = 0; attempt < 5; attempt++) {
      vi.resetModules();
      const fresh = await import("@/lib/staleChunkReload");
      expect(fresh.recoverFromStaleChunk("ChunkLoadError")).toBe(!blocked && attempt < 2);
    }
    expect(reload).toHaveBeenCalledTimes(blocked ? 0 : 2);
  });

  it("sólo cancela preload cuando la recarga está en marcha", () => {
    const first = new Event("vite:preloadError", { cancelable: true });
    handleStaleChunkPreloadError(first);
    const duplicate = new Event("vite:preloadError", { cancelable: true });
    handleStaleChunkPreloadError(duplicate);
    expect(first.defaultPrevented).toBe(true);
    expect(duplicate.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each(["exhausted", "blocked"])("no suprime el rechazo de preload cuando %s", (reason) => {
    if (reason === "exhausted") sessionStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), count: 2 }));
    else vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), setItem: () => { throw new Error("Storage blocked"); } });
    const event = new Event("vite:preloadError", { cancelable: true });
    handleStaleChunkPreloadError(event);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
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
