import { describe, expect, it } from "vitest";
import { BLOCKED_PRODUCTION_REF, assertSafeTarget, maskSecrets, sanitizeError } from "../../scripts/restore-rehearsal/guards";
import { buildOrgLabels, findSensitiveLeak, labelFor } from "../../scripts/restore-rehearsal/masking";
import { CANONICAL_STORAGE_BUCKETS, readFolios, readStorage } from "../../scripts/restore-rehearsal/queries";
import { MASKED_TARGET, buildReport, renderMarkdown } from "../../scripts/restore-rehearsal/report";
import { computeTiming } from "../../scripts/restore-rehearsal/timing";

const SAFE_URL = "postgresql://user:pass@db.aislada-ref01.example.com:5432/postgres";
const TIMING = computeTiming({
  backupTimestampUtc: "2026-09-21T00:00:00Z",
  incidentTimestampUtc: "2026-09-21T00:20:00Z",
  restoreStartedUtc: "2026-09-21T00:30:00Z",
  restoreReadyUtc: "2026-09-21T01:00:00Z",
  rpoTargetMinutes: 60,
  rtoTargetMinutes: 60,
});

describe("restore rehearsal · guards", () => {
  it("acepta el host aislado esperado", () => {
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: "aislada-ref01" })).not.toThrow();
  });
  it("bloquea el ref productivo en URL o expected ref", () => {
    expect(() => assertSafeTarget({ databaseUrl: `postgresql://u:p@db.${BLOCKED_PRODUCTION_REF}.supabase.co/postgres`, expectedRef: "aislada-ref01" })).toThrow(/productivo/i);
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: BLOCKED_PRODUCTION_REF })).toThrow(/productivo/i);
  });
  it("bloquea faltantes, protocolos y destinos que no coinciden", () => {
    expect(() => assertSafeTarget({ databaseUrl: "", expectedRef: "aislada-ref01" })).toThrow(/Falta/);
    expect(() => assertSafeTarget({ databaseUrl: "mysql://u:p@aislada-ref01/db", expectedRef: "aislada-ref01" })).toThrow(/postgres/i);
    expect(() => assertSafeTarget({ databaseUrl: SAFE_URL, expectedRef: "otro-ref99" })).toThrow(/no corresponde/i);
  });
  it("acepta loopback sólo si se declara local", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(() => assertSafeTarget({ databaseUrl: url, expectedRef: "local-restore" })).not.toThrow();
    expect(() => assertSafeTarget({ databaseUrl: url, expectedRef: "aislada-ref01" })).toThrow();
  });
  it("elimina DSN y ref esperado de errores", () => {
    const message = sanitizeError(new Error(`falló ${SAFE_URL} aislada-ref01`), [SAFE_URL, "aislada-ref01"]);
    expect(message).not.toContain("pass");
    expect(message).not.toContain("aislada-ref01");
    expect(maskSecrets(`dsn ${SAFE_URL}`)).not.toContain("@db.");
  });
});

describe("restore rehearsal · RPO/RTO", () => {
  it("usa incidente-backup para RPO y ready-start para RTO", () => {
    expect(TIMING.rpoMinutes).toBe(20);
    expect(TIMING.rtoMinutes).toBe(30);
    expect(TIMING.pass).toBe(true);
  });
  it("falla al exceder objetivos", () => {
    expect(computeTiming({ ...TIMING, rpoTargetMinutes: 10 }).pass).toBe(false);
  });
  it("rechaza fechas sin Z y orden imposible", () => {
    expect(() => computeTiming({ ...TIMING, backupTimestampUtc: "2026-09-21T00:00:00" })).toThrow(/UTC/);
    expect(() => computeTiming({ ...TIMING, incidentTimestampUtc: "2026-09-20T23:00:00Z" })).toThrow(/incidente/i);
    expect(() => computeTiming({ ...TIMING, restoreStartedUtc: "2026-09-21T00:10:00Z" })).toThrow(/incidente/i);
    expect(() => computeTiming({ ...TIMING, restoreReadyUtc: "2026-09-21T00:10:00Z" })).toThrow(/inicio/i);
  });
});

describe("restore rehearsal · consultas", () => {
  it("consulta invoices.issued_at y nunca la columna inexistente issue_date", async () => {
    let query = "";
    await readFolios({ unsafe: async (sql) => { query = sql; return []; } });
    expect(query).toContain("issued_at");
    expect(query).not.toContain("issue_date");
  });
  it("cuenta referencias canónicas sin depender de documents.bucket", async () => {
    const queries: string[] = [];
    const storage = await readStorage({
      unsafe: async (sql) => {
        queries.push(sql);
        if (sql.includes("storage.objects")) return [{ bucket: "documents", n: 3 }, { bucket: "custom-private", n: 2 }];
        return [{ n: 1 }];
      },
    });
    expect(queries.join("\n")).not.toContain("documents.bucket");
    expect(storage.map((entry) => entry.bucket)).toEqual([...CANONICAL_STORAGE_BUCKETS, "other"]);
    expect(storage.find((entry) => entry.bucket === "other")?.objects).toBe(2);
    expect(storage.some((entry) => entry.bucket === "custom-private")).toBe(false);
  });
});

describe("restore rehearsal · masking y reporte", () => {
  it("crea etiquetas ORG deterministas", () => {
    const labels = buildOrgLabels(["b", "a", "b"]);
    expect(labelFor(labels, "a")).toBe("ORG-001");
    expect(labelFor(labels, "b")).toBe("ORG-002");
  });
  it("detecta UUID, correo, DSN y JWT", () => {
    expect(findSensitiveLeak("123e4567-e89b-12d3-a456-426614174000")).toBe("uuid");
    expect(findSensitiveLeak("a@b.com")).toBe("email");
    expect(findSensitiveLeak("postgresql://u:p@h/d")).toBe("dsn");
    expect(findSensitiveLeak("eyJhbGciOiJIUzI1NiJ9xxxx")).toBe("jwt");
  });
  it("publica una etiqueta fija y no el ref real", () => {
    const report = buildReport({
      commit: "abc1234",
      generatedAtUtc: "2026-09-21T01:05:00.000Z",
      timing: TIMING,
      ledger: { supabaseMigrations: 1, drizzleMigrations: 1, lastSupabaseVersion: "20260921", lastDrizzleHashPrefix: "ab12cd34" },
      tableCounts: [{ table: "invoices", rows: 1 }],
      activeOrganizations: 1,
      folios: [{ org: "ORG-001", year: 2026, documents: 1, lastFolio: 1 }],
      storage: [{ bucket: "documents", objects: 1, referencedRows: 1 }],
      checks: [{ id: "C1", label: "Lectura", pass: true, detail: "ok" }],
    });
    const markdown = renderMarkdown(report);
    expect(report.target).toBe(MASKED_TARGET);
    expect(markdown).toContain("**PASS**");
    expect(markdown).not.toContain("aislada-ref01");
    expect(findSensitiveLeak(JSON.stringify(report))).toBeNull();
    expect(findSensitiveLeak(markdown)).toBeNull();
  });
  it("aborta antes de escribir si aparece un dato sensible", () => {
    expect(() => buildReport({
      commit: "abc",
      generatedAtUtc: "2026-09-21T01:00:00Z",
      timing: TIMING,
      ledger: { supabaseMigrations: 1, drizzleMigrations: 1, lastSupabaseVersion: null, lastDrizzleHashPrefix: null },
      tableCounts: [], activeOrganizations: 0,
      folios: [{ org: "123e4567-e89b-12d3-a456-426614174000", year: 2026, documents: 1, lastFolio: 1 }],
      storage: [], checks: [],
    })).toThrow(/sensibles/);
  });
});

