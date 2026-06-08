/**
 * Lote 8 — Auth types / helpers.
 * Fuente: src/features/auth/lib/authTypes.ts
 *
 * Exports reales: AuthMode (type), getAuthSubmitLabel(loading, mode).
 *
 * OMISIONES REPORTADAS:
 *   - isAdmin / isMechanic: NO existen en authTypes.ts → omitidos.
 */
import { describe, it, expect } from "vitest";
import { getAuthSubmitLabel } from "@/features/auth/lib/authTypes";
import type { AuthMode } from "@/features/auth/lib/authTypes";

describe("getAuthSubmitLabel", () => {
  it("devuelve 'Cargando...' cuando loading=true, sin importar el modo", () => {
    const modes: AuthMode[] = ["sign-in", "forgot", "reset"];
    for (const mode of modes) {
      expect(getAuthSubmitLabel(true, mode)).toBe("Cargando...");
    }
  });

  it("modo 'forgot' → 'Enviar Enlace'", () => {
    expect(getAuthSubmitLabel(false, "forgot")).toBe("Enviar Enlace");
  });

  it("modo 'reset' → 'Actualizar Contraseña'", () => {
    expect(getAuthSubmitLabel(false, "reset")).toBe("Actualizar Contraseña");
  });

  it("modo 'sign-in' → 'Iniciar Sesión' (rama default)", () => {
    expect(getAuthSubmitLabel(false, "sign-in")).toBe("Iniciar Sesión");
  });

  it("loading=true tiene prioridad sobre modo específico", () => {
    expect(getAuthSubmitLabel(true, "forgot")).not.toBe("Enviar Enlace");
    expect(getAuthSubmitLabel(true, "reset")).not.toBe("Actualizar Contraseña");
  });
});
