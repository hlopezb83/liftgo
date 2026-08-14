import { describe, it, expect, vi, beforeEach } from "vitest";
import { readSessionParams, writeSessionParams } from "../sessionStorage";

describe("sessionStorage filter helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Limpia cualquier residuo
    try {
      window.sessionStorage.clear();
    } catch {
      // noop
    }
  });

  it("readSessionParams devuelve URLSearchParams vacío cuando getItem lanza", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Security error", "SecurityError");
    });

    const params = readSessionParams("/proveedores");
    expect(params.toString()).toBe("");
  });

  it("readSessionParams lee el valor guardado cuando funciona", () => {
    window.sessionStorage.setItem("list-filters:/proveedores", "status=open&page=2");
    const params = readSessionParams("/proveedores");
    expect(params.get("status")).toBe("open");
    expect(params.get("page")).toBe("2");
  });

  it("writeSessionParams no propaga el error cuando setItem lanza", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => {
      writeSessionParams("/proveedores", new URLSearchParams("status=open"));
    }).not.toThrow();
  });

  it("writeSessionParams no propaga el error cuando removeItem lanza", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Security error", "SecurityError");
    });

    expect(() => {
      writeSessionParams("/proveedores", new URLSearchParams(""));
    }).not.toThrow();
  });

  it("writeSessionParams escribe y readSessionParams lee de vuelta", () => {
    writeSessionParams("/clientes", new URLSearchParams("q=acme&tab=active"));
    const params = readSessionParams("/clientes");
    expect(params.get("q")).toBe("acme");
    expect(params.get("tab")).toBe("active");
  });

  it("writeSessionParams elimina la clave cuando params está vacío", () => {
    window.sessionStorage.setItem("list-filters:/clientes", "q=acme");
    writeSessionParams("/clientes", new URLSearchParams(""));
    expect(window.sessionStorage.getItem("list-filters:/clientes")).toBeNull();
  });
});
