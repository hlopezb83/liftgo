/**
 * El guard fail-closed de E2E es código de seguridad: si se rompe, una corrida
 * de pruebas puede escribir en la base PRODUCTIVA. Estas pruebas son offline y
 * puramente en memoria (solo manipulan process.env y leen el `.env` del repo).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNonProductionBackend,
  PRODUCTION_PROJECT_REFS,
} from "../../tests/e2e/fixtures/productionGuard";

const MANAGED = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_ID",
  "E2E_SUPABASE_URL",
  "E2E_ISOLATED_BACKEND",
  "E2E_ALLOW_REMOTE_BACKEND",
  "E2E_FORBIDDEN_PROJECT_REFS",
] as const;

let saved: Record<string, string | undefined> = {};

/** Neutraliza el fallback a `.env`/`.env.local` fijando destinos locales explícitos. */
function setLocalTargets(): void {
  process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.VITE_SUPABASE_PROJECT_ID = "local";
  process.env.SUPABASE_PROJECT_ID = "local";
  process.env.E2E_SUPABASE_URL = "http://127.0.0.1:54321";
}

beforeEach(() => {
  saved = Object.fromEntries(MANAGED.map((k) => [k, process.env[k]]));
  for (const k of MANAGED) delete process.env[k];
});

afterEach(() => {
  for (const k of MANAGED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("assertNonProductionBackend", () => {
  it("bloquea el ref productivo pasado por variable de entorno", () => {
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.VITE_SUPABASE_URL = `https://${PRODUCTION_PROJECT_REFS[0]}.supabase.co`;
    process.env.E2E_ALLOW_REMOTE_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea el ref productivo heredado del .env del repo (fallback de apiAuth)", () => {
    // Sin variables de proceso, el destino efectivo sale del `.env` del repo,
    // que apunta a producción. Esta era la brecha del guard original.
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.E2E_ALLOW_REMOTE_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea cuando falta la declaración de entorno aislado", () => {
    setLocalTargets();
    expect(() => assertNonProductionBackend("test")).toThrow(/E2E_ISOLATED_BACKEND=1/);
  });

  it("bloquea un host remoto sin escape explícito", () => {
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.VITE_SUPABASE_URL = "https://otro-proyecto.supabase.co";
    expect(() => assertNonProductionBackend("test")).toThrow(/host remoto/);
  });

  it("permite un backend local declarado como aislado", () => {
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).not.toThrow();
  });

  it("respeta refs prohibidos adicionales", () => {
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.E2E_FORBIDDEN_PROJECT_REFS = "54321";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });
});
