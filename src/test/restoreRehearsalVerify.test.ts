/**
 * Pruebas offline del verificador de restore: guards fail-closed, cálculo
 * RPO/RTO, enmascarado y formato del reporte. No abre ninguna conexión.
 */

import { describe, expect, it } from "vitest";
import {
  BLOCKED_PRODUCTION_REF,
  assertSafeTarget,
  maskHost,
  maskSecrets,
  sanitizeError,
} from "../../scripts/restore-rehearsal/guards";
import { buildOrgLabels, findSensitiveLeak, labelFor } from "../../scripts/restore-rehearsal/masking";
import { computeTiming } from "../../scripts/restore-rehearsal/timing";
import { buildReport, renderMarkdown } from "../../scripts/restore-rehearsal/report";

const SAFE_URL = "postgresql://user:pass@db.aislada-ref01.example.com:5432/postgres";

const TIMING = computeTiming({
  backupTimestampUtc: "2026-09-21T00:00:00Z",
  restoreStartedUtc: "2026-09-21T00:30:00Z",
  restoreReadyUtc: "2026-09-21T01:00:00Z",
  rpoTargetMinutes: 60,
  rtoTargetMinutes: 60,
});

describe("restore rehearsal · guards", () => {
  it("acepta una instancia aislada cuyo host contiene el ref esperado", () => {
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: "aislada-ref01" })).not.toThrow();
  });

  it("aborta si la URL contiene el ref productivo bloqueado", () => {
    expect(() =>
      assertSafeTarget({
        databaseUrl: `postgresql://u:p@db.${BLOCKED_PRODUCTION_REF}.supabase.co:5432/postgres`,
        expectedRef: "aislada-ref01",
      }),
    ).toThrow(/ref productivo/i);
  });

  it("aborta si el ref esperado es el productivo", () => {
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: BLOCKED_PRODUCTION_REF })).toThrow(
      /ref productivo/i,
    );
  });

  it("aborta si falta la URL o el ref esperado", () => {
    expect(() => assertSafeTarget({ databaseUrl: "", expectedRef: "aislada-ref01" })).toThrow(/Falta/);
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: "" })).toThrow(/Falta/);
  });

  it("aborta si la URL no corresponde al ref esperado", () => {
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: "otro-ref99" })).toThrow(/no corresponde/i);
  });

  it("acepta loopback sólo cuando el ref esperado se declara local", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(() => assertSafeTarget({ databaseUrl: url, expectedRef: "local-restore-rehearsal" })).not.toThrow();
    expect(() => assertSafeTarget({ databaseUrl: url, expectedRef: "aislada-ref01" })).toThrow(/no corresponde/i);
  });

  it("rechaza esquemas que no son postgres", () => {
    expect(() => assertSafeTarget({ databaseUrl: "mysql://u:p@aislada-ref01/db", expectedRef: "aislada-ref01" })).toThrow(
      /postgres/i,
    );
  });

  it("nunca deja la URL de conexión en el mensaje de error", () => {
    const message = sanitizeError(new Error(`falló contra ${SAFE_URL}`), [SAFE_URL]);
    expect(message).not.toContain("aislada-ref01");
    expect(message).not.toContain("pass");
    expect(maskSecrets(`dsn ${SAFE_URL}`)).not.toContain("@db.");
  });

  it("enmascara el host dejando sólo el dominio", () => {
    expect(maskHost("db.aislada-ref01.example.com")).toBe("***.example.com");
    expect(maskHost("localhost")).toBe("***");
  });
});

describe("restore rehearsal · RPO/RTO", () => {
  it("calcula minutos y compara contra los objetivos", () => {
    expect(TIMING.rpoMinutes).toBe(30);
    expect(TIMING.rtoMinutes).toBe(30);
    expect(TIMING.pass).toBe(true);
  });

  it("marca FAIL cuando se excede un objetivo", () => {
    const result = computeTiming({
      backupTimestampUtc: "2026-09-21T00:00:00Z",
      restoreStartedUtc: "2026-09-21T02:00:00Z",
      restoreReadyUtc: "2026-09-21T02:10:00Z",
      rpoTargetMinutes: 60,
      rtoTargetMinutes: 60,
    });
    expect(result.rpoPass).toBe(false);
    expect(result.rtoPass).toBe(true);
    expect(result.pass).toBe(false);
  });

  it("rechaza fechas inválidas, orden imposible y objetivos no positivos", () => {
    expect(() =>
      computeTiming({ ...TIMING, backupTimestampUtc: "no-fecha" } as never),
    ).toThrow(/backup_timestamp_utc/);
    expect(() =>
      computeTiming({
        backupTimestampUtc: "2026-09-21T03:00:00Z",
        restoreStartedUtc: "2026-09-21T00:00:00Z",
        restoreReadyUtc: "2026-09-21T04:00:00Z",
        rpoTargetMinutes: 60,
        rtoTargetMinutes: 60,
      }),
    ).toThrow(/anterior a backup/);
    expect(() =>
      computeTiming({
        backupTimestampUtc: "2026-09-21T00:00:00Z",
        restoreStartedUtc: "2026-09-21T01:00:00Z",
        restoreReadyUtc: "2026-09-21T00:30:00Z",
        rpoTargetMinutes: 60,
        rtoTargetMinutes: 60,
      }),
    ).toThrow(/anterior a restore_started/);
    expect(() =>
      computeTiming({
        backupTimestampUtc: "2026-09-21T00:00:00Z",
        restoreStartedUtc: "2026-09-21T00:10:00Z",
        restoreReadyUtc: "2026-09-21T00:20:00Z",
        rpoTargetMinutes: 0,
        rtoTargetMinutes: 60,
      }),
    ).toThrow(/rpo_target_minutes/);
  });
});

describe("restore rehearsal · masking", () => {
  it("etiqueta organizaciones de forma determinista", () => {
    const ids = ["b-2222", "a-1111", "b-2222"];
    const labels = buildOrgLabels(ids);
    expect(labelFor(labels, "a-1111")).toBe("ORG-001");
    expect(labelFor(labels, "b-2222")).toBe("ORG-002");
    expect(labelFor(labels, "desconocido")).toBe("ORG-UNK");
  });

  it("detecta fugas de UUID, correo, DSN y token", () => {
    expect(findSensitiveLeak("id 123e4567-e89b-12d3-a456-426614174000")).toBe("uuid");
    expect(findSensitiveLeak("contacto@ejemplo.com")).toBe("email");
    expect(findSensitiveLeak("postgresql://u:p@h/d")).toBe("dsn");
    expect(findSensitiveLeak("Bearer eyJhbGciOiJIUzI1NiJ9")).toBe("jwt");
    expect(findSensitiveLeak("ORG-001 | 2026 | 12 | 345")).toBeNull();
  });
});

const BASE_INPUT = {
  commit: "abc1234",
  expectedRef: "aislada-ref01",
  generatedAtUtc: "2026-09-21T01:05:00.000Z",
  timing: TIMING,
  ledger: { supabaseMigrations: 120, drizzleMigrations: 36, lastSupabaseVersion: "20260921", lastDrizzleHashPrefix: "ab12cd34" },
  tableCounts: [{ table: "invoices", rows: 10 }],
  activeOrganizations: 1,
  folios: [{ org: "ORG-001", year: 2026, documents: 10, lastFolio: 42 }],
  storage: [{ bucket: "documents", objects: 5, referencedRows: 5 }],
  checks: [{ id: "C1", label: "Conexión", pass: true, detail: "ok" }],
};

describe("restore rehearsal · reporte", () => {
  it("construye el reporte con esquema, versión y pass agregado", () => {
    const report = buildReport(BASE_INPUT);
    expect(report.schema).toBe("liftgo.restore-rehearsal");
    expect(report.schemaVersion).toBe(1);
    expect(report.pass).toBe(true);
  });

  it("marca FAIL si alguna comprobación falla", () => {
    const report = buildReport({
      ...BASE_INPUT,
      checks: [{ id: "C1", label: "Conexión", pass: false, detail: "sin respuesta" }],
    });
    expect(report.pass).toBe(false);
  });

  it("aborta si el reporte llevara datos sensibles", () => {
    expect(() =>
      buildReport({ ...BASE_INPUT, folios: [{ org: "123e4567-e89b-12d3-a456-426614174000", year: 2026, documents: 1, lastFolio: 1 }] }),
    ).toThrow(/sensibles/);
  });

  it("renderiza markdown con las secciones y sin datos personales", () => {
    const md = renderMarkdown(buildReport(BASE_INPUT));
    expect(md).toContain("# Verificación de restore en instancia aislada");
    expect(md).toContain("RPO (min)");
    expect(md).toContain("ORG-001");
    expect(md).toContain("**PASS**");
    expect(findSensitiveLeak(md)).toBeNull();
  });
});
