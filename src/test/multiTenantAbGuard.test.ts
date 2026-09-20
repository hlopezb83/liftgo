/**
 * Regresión offline del guard del gate A/B: la suite debe abortar ante
 * cualquier destino remoto, el ref productivo o un escape declarado.
 * No hace red ni toca ninguna base.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalEphemeralBackend } from "../../tests/multi-tenant-ab/fixtures/localBackend";

const KEYS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "E2E_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_ID",
  "E2E_ISOLATED_BACKEND",
  "E2E_ALLOW_REMOTE_BACKEND",
] as const;

const saved: Record<string, string | undefined> = {};

function setLocalEnv(): void {
  process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.VITE_SUPABASE_PROJECT_ID = "local-ab-ephemeral";
  process.env.SUPABASE_PROJECT_ID = "local-ab-ephemeral";
  process.env.E2E_ISOLATED_BACKEND = "1";
  delete process.env.E2E_ALLOW_REMOTE_BACKEND;
  delete process.env.E2E_SUPABASE_URL;
}

describe("gate A/B · guard fail-closed", () => {
  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    setLocalEnv();
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("acepta el backend local efímero", () => {
    expect(() => assertLocalEphemeralBackend("test")).not.toThrow();
  });

  it("aborta si falta la declaración de entorno aislado", () => {
    delete process.env.E2E_ISOLATED_BACKEND;
    expect(() => assertLocalEphemeralBackend("test")).toThrow();
  });

  it("aborta ante un host remoto", () => {
    process.env.SUPABASE_URL = "https://ejemplo-remoto.supabase.co";
    expect(() => assertLocalEphemeralBackend("test")).toThrow();
  });

  it("aborta ante el ref productivo", () => {
    process.env.VITE_SUPABASE_PROJECT_ID = "zxefrzfaynnfwazqhwxp";
    expect(() => assertLocalEphemeralBackend("test")).toThrow();
  });

  it("no admite el escape remoto declarado", () => {
    process.env.E2E_ALLOW_REMOTE_BACKEND = "1";
    expect(() => assertLocalEphemeralBackend("test")).toThrow();
  });

  it("exige identificadores de proyecto locales", () => {
    process.env.SUPABASE_PROJECT_ID = "produccion-cualquiera";
    expect(() => assertLocalEphemeralBackend("test")).toThrow();
  });
});
