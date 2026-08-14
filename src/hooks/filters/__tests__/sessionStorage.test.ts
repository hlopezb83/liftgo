import { describe, it, expect, vi, afterEach } from "vitest";
import { readSessionParams, writeSessionParams } from "../sessionStorage";

describe("sessionStorage filter helpers", () => {
  afterEach(() => {
    try {
      window.sessionStorage.clear();
    } catch {
      // noop
    }
  });

  it("readSessionParams devuelve URLSearchParams vacío cuando getItem lanza", () => {
    const original = window.sessionStorage;
    const failing = {
      getItem: () => {
        throw new DOMException("Security error", "SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage;
    Object.defineProperty(window, "sessionStorage", {
      value: failing,
      configurable: true,
    });

    const params = readSessionParams("/proveedores");
    expect(params.toString()).toBe("");

    Object.defineProperty(window, "sessionStorage", {
      value: original,
      configurable: true,
    });
  });

  it("readSessionParams lee el valor guardado cuando funciona", () => {
    window.sessionStorage.setItem("list-filters:/proveedores", "status=open&page=2");
    const params = readSessionParams("/proveedores");
    expect(params.get("status")).toBe("open");
    expect(params.get("page")).toBe("2");
  });

  it("writeSessionParams no propaga el error cuando setItem lanza", () => {
    const original = window.sessionStorage;
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage;
    Object.defineProperty(window, "sessionStorage", {
      value: failing,
      configurable: true,
    });

    expect(() => {
      writeSessionParams("/proveedores", new URLSearchParams("status=open"));
    }).not.toThrow();

    Object.defineProperty(window, "sessionStorage", {
      value: original,
      configurable: true,
    });
  });

  it("writeSessionParams no propaga el error cuando removeItem lanza", () => {
    const original = window.sessionStorage;
    const failing = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new DOMException("Security error", "SecurityError");
      },
      clear: () => {},
    } as unknown as Storage;
    Object.defineProperty(window, "sessionStorage", {
      value: failing,
      configurable: true,
    });

    expect(() => {
      writeSessionParams("/proveedores", new URLSearchParams(""));
    }).not.toThrow();

    Object.defineProperty(window, "sessionStorage", {
      value: original,
      configurable: true,
    });
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
