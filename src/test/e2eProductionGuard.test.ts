/**
 * El guard fail-closed de E2E es código de seguridad: si se rompe, una corrida
 * de pruebas puede escribir en la base PRODUCTIVA. Estas pruebas son offline:
 * manipulan `process.env` y trabajan sobre un directorio temporal con su
 * propio `.env`, porque el guard resuelve los archivos relativos al cwd.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNonProductionBackend,
  PRODUCTION_PROJECT_REFS,
  resolveEnvValue,
} from "../../tests/e2e/fixtures/productionGuard";

const PROD_REF = PRODUCTION_PROJECT_REFS[0];

const MANAGED = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_ID",
  "E2E_SUPABASE_URL",
  // Vitest carga el `.env` del repo en process.env; sin limpiarla, la clave
  // real ganaría la precedencia dentro de las pruebas.
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "E2E_ISOLATED_BACKEND",
  "E2E_ALLOW_REMOTE_BACKEND",
  "E2E_FORBIDDEN_PROJECT_REFS",
] as const;

let saved: Record<string, string | undefined> = {};
let originalCwd = "";
let workDir = "";

/** Escribe un `.env` en el directorio temporal que el guard va a leer. */
function writeDotenv(contents: string, file = ".env"): void {
  writeFileSync(join(workDir, file), contents, "utf8");
}

/** Destinos locales explícitos por variable de proceso. */
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
  originalCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), "liftgo-guard-"));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
  for (const k of MANAGED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("assertNonProductionBackend", () => {
  it("bloquea el ref productivo pasado por variable de entorno", () => {
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.VITE_SUPABASE_URL = `https://${PROD_REF}.supabase.co`;
    process.env.E2E_ALLOW_REMOTE_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea el ref productivo heredado del .env del repo", () => {
    writeDotenv(`VITE_SUPABASE_URL="https://${PROD_REF}.supabase.co"\n`);
    process.env.E2E_ISOLATED_BACKEND = "1";
    process.env.E2E_ALLOW_REMOTE_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea aunque una variable local no productiva tape el .env productivo", () => {
    // La ruta que dejaba pasar producción: el guard veía solo el valor que
    // gana la precedencia. Ahora se auditan TODAS las procedencias.
    writeDotenv(`VITE_SUPABASE_URL="https://${PROD_REF}.supabase.co"\n`);
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea el ref productivo escondido en .env.local", () => {
    writeDotenv(`SUPABASE_PROJECT_ID=${PROD_REF}\n`, ".env.local");
    setLocalTargets();
    process.env.E2E_ISOLATED_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/proyecto productivo bloqueado/);
  });

  it("bloquea cuando falta la declaración de entorno aislado", () => {
    setLocalTargets();
    expect(() => assertNonProductionBackend("test")).toThrow(/E2E_ISOLATED_BACKEND=1/);
  });

  it("bloquea cuando no hay ningún destino configurado", () => {
    process.env.E2E_ISOLATED_BACKEND = "1";
    expect(() => assertNonProductionBackend("test")).toThrow(/no hay ninguna URL/);
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

describe("resolveEnvValue (misma fuente que usa el cliente E2E)", () => {
  it("prioriza la variable de proceso sobre los archivos", () => {
    writeDotenv('VITE_SUPABASE_URL="http://desde-archivo"\n');
    process.env.VITE_SUPABASE_URL = "http://desde-proceso";
    expect(resolveEnvValue("VITE_SUPABASE_URL")).toBe("http://desde-proceso");
  });

  it("cae a .env y luego a .env.local", () => {
    writeDotenv('VITE_SUPABASE_URL="http://desde-env"\n');
    writeDotenv('VITE_SUPABASE_PUBLISHABLE_KEY="clave-local"\n', ".env.local");
    expect(resolveEnvValue("VITE_SUPABASE_URL")).toBe("http://desde-env");
    expect(resolveEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")).toBe("clave-local");
  });

  it("devuelve undefined si el valor no está en ninguna fuente", () => {
    expect(resolveEnvValue("VITE_SUPABASE_URL")).toBeUndefined();
  });
});
