#!/usr/bin/env bun
/** Verifica en solo lectura una copia que ya fue restaurada fuera del repo. */

import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { DATABASE_URL_ENV, EXPECTED_REF_ENV, assertSafeTarget, sanitizeError } from "./guards";
import { CANONICAL_STORAGE_BUCKETS, readActiveOrganizations, readFolios, readLedger, readStorage, readTableCounts } from "./queries";
import { buildReport, renderMarkdown, type CheckResult } from "./report";
import { computeTiming } from "./timing";

const OUT_DIR = "reports";
const env = (name: string): string => (process.env[name] ?? "").trim();

async function main(): Promise<void> {
  const databaseUrl = env(DATABASE_URL_ENV);
  assertSafeTarget({ databaseUrl, expectedRef: env(EXPECTED_REF_ENV) });
  const timing = computeTiming({
    backupTimestampUtc: env("RESTORE_REHEARSAL_BACKUP_TIMESTAMP_UTC"),
    incidentTimestampUtc: env("RESTORE_REHEARSAL_INCIDENT_TIMESTAMP_UTC"),
    restoreStartedUtc: env("RESTORE_REHEARSAL_STARTED_UTC"),
    restoreReadyUtc: env("RESTORE_REHEARSAL_READY_UTC"),
    rpoTargetMinutes: Number(env("RESTORE_REHEARSAL_RPO_TARGET_MINUTES")),
    rtoTargetMinutes: Number(env("RESTORE_REHEARSAL_RTO_TARGET_MINUTES")),
  });

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 10, connect_timeout: 15, prepare: false, onnotice: () => {} });
  try {
    const data = await sql.begin("read only", async (tx) => {
      await tx.unsafe("set local statement_timeout = '60s'");
      await tx.unsafe("set local idle_in_transaction_session_timeout = '60s'");
      const alive = await tx.unsafe("select 1 as ok");
      return {
        alive,
        ledger: await readLedger(tx),
        tableCounts: await readTableCounts(tx),
        activeOrganizations: await readActiveOrganizations(tx),
        folios: await readFolios(tx),
        storage: await readStorage(tx),
      };
    });

    const storageComplete = data.storage.length === CANONICAL_STORAGE_BUCKETS.length + 1;
    const noMissingReferencedBucket = data.storage.every((entry) => entry.referencedRows === 0 || entry.objects > 0);
    const checks: CheckResult[] = [
      { id: "C1", label: "Conexion de solo lectura", pass: Number(data.alive[0]?.ok) === 1, detail: "select 1 ok" },
      { id: "C2", label: "Ledger presente", pass: data.ledger.supabaseMigrations > 0 && data.ledger.drizzleMigrations > 0, detail: `supabase=${data.ledger.supabaseMigrations}, drizzle=${data.ledger.drizzleMigrations}` },
      { id: "C3", label: "Tablas operativas legibles", pass: data.tableCounts.length > 0, detail: `${data.tableCounts.length} tablas consultadas` },
      { id: "C4", label: "Organizacion activa presente", pass: data.activeOrganizations >= 1, detail: `activas=${data.activeOrganizations}` },
      { id: "C5", label: "Folios agregados", pass: data.folios.every((folio) => folio.documents >= 0 && folio.lastFolio >= 0), detail: `${data.folios.length} combinaciones` },
      { id: "C6", label: "Storage agregado consistente", pass: storageComplete && noMissingReferencedBucket, detail: `${CANONICAL_STORAGE_BUCKETS.length} buckets canonicos + other` },
    ];
    const report = buildReport({
      commit: env("GITHUB_SHA") || "local",
      generatedAtUtc: new Date().toISOString(),
      timing,
      ledger: data.ledger,
      tableCounts: data.tableCounts,
      activeOrganizations: data.activeOrganizations,
      folios: data.folios,
      storage: data.storage,
      checks,
    });

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(`${OUT_DIR}/restore-rehearsal.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(`${OUT_DIR}/restore-rehearsal.md`, renderMarkdown(report), "utf8");
    console.log(`Verificacion de restore: ${report.pass ? "PASS" : "FAIL"} (reportes sanitizados generados)`);
    if (!report.pass) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Verificacion de restore abortada: ${sanitizeError(error, [env(DATABASE_URL_ENV), env(EXPECTED_REF_ENV)])}`);
  process.exit(1);
});

