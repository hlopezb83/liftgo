import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupBankAccount, cleanupBookingDependents } from "../../tests/multi-tenant-ab/fixtures/localCleanup";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(() => ({ status: 0, stderr: "" })), guard: vi.fn(),
}));
vi.mock("node:child_process", () => ({ default: { spawnSync: mocks.spawn }, spawnSync: mocks.spawn }));
vi.mock("../../tests/multi-tenant-ab/fixtures/localBackend", () => ({
  assertLocalEphemeralBackend: mocks.guard,
}));

const org = "00000000-0000-0000-0000-000000000001";
const record = "00000000-0000-0000-0000-000000000002";

describe("limpieza SQL del backend efímero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spawn.mockReturnValue({ status: 0, stderr: "" });
    vi.stubEnv("DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rechaza un PostgreSQL remoto antes de ejecutar", () => {
    vi.stubEnv("DB_URL", "postgresql://postgres:placeholder@db.example.com:54322/postgres");
    expect(() => cleanupBankAccount(org, record)).toThrow(/efímero local/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("requiere DB_URL explícita", () => {
    vi.stubEnv("DB_URL", "");
    expect(() => cleanupBankAccount(org, record)).toThrow(/falta DB_URL/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("rechaza un ID de empresa manipulable", () => {
    expect(() => cleanupBankAccount("'; DELETE FROM public.invoices; --", record)).toThrow(/ID inválido/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("rechaza un ID de reserva manipulable", () => {
    expect(() => cleanupBookingDependents(org, ["invalid"])).toThrow(/ID inválido/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("propaga el fallo SQL sin dar la limpieza por completada", () => {
    mocks.spawn.mockReturnValue({ status: 1, stderr: "violación de integridad" });
    expect(() => cleanupBankAccount(org, record)).toThrow(/violación de integridad/);
  });
  it("limpia entregas sólo por empresa y reserva en una transacción estricta", () => {
    cleanupBookingDependents(org, [record]);
    expect(mocks.guard).toHaveBeenCalled();
    const [, args, options] = mocks.spawn.mock.calls[0] as unknown as [string, string[], { input: string }];
    expect(args).toContain("ON_ERROR_STOP=1");
    expect(options.input).toMatch(/^BEGIN;.*app.organization_id.*DELETE.*COMMIT;$/);
    expect(options.input.match(/organization_id = /g)).toHaveLength(2);
    expect(options.input.match(new RegExp(record, "g"))).toHaveLength(2);
    expect(options.input).not.toMatch(/DISABLE TRIGGER|TRUNCATE|REVOKE|GRANT/i);
  });
  it("elimina cargas privadas antes de la cuenta y acota cada borrado", () => {
    cleanupBankAccount(org, record);
    const [, , options] = mocks.spawn.mock.calls[0] as unknown as [string, string[], { input: string }];
    expect(options.input.indexOf("DELETE FROM public.bank_statement_uploads"))
      .toBeLessThan(options.input.indexOf("DELETE FROM public.bank_accounts"));
    expect(options.input.match(/organization_id = /g)).toHaveLength(4);
    expect(options.input.match(new RegExp(record, "g"))).toHaveLength(4);
  });
});
