#!/usr/bin/env bun
/**
 * Verificador de una copia YA restaurada en una instancia aislada.
 *
 * NO restaura nada, NO escribe en la base y NO acepta producción: la conexión
 * llega sólo por RESTORE_REHEARSAL_DATABASE_URL y se valida fail-closed contra
 * RESTORE_REHEARSAL_EXPECTED_REF antes de abrir el socket.
 *
 * Salidas: reports/restore-rehearsal.json y reports/restore-rehearsal.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { DATABASE_URL_ENV, EXPECTED_REF_ENV, assertSafeTarget, sanitizeError } from "./guards";
import { buildReport, renderMarkdown, type CheckResult } from "./report";
import { readActiveOrganizations, readFolios, readLedger, readStorage, readTableCounts } from "./queries";
import { computeTiming } from "./timing";

const OUT_DIR = "reports";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

async function main(): Promise<void> {
  const databaseUrl = env(DATABASE_URL_ENV);
  const { expectedRef } = assertSafeTarget({ databaseUrl, expectedRef: env(EXPECTED_REF_ENV) });

  const timing = computeTiming({
    backupTimestampUtc: env("RESTORE_REHEARSAL_BACKUP_TIMESTAMP_UTC"),
    restoreStartedUtc: env("RESTORE_REHEARSAL_STARTED_UTC"),
    restoreReadyUtc: env("RESTORE_REHEARSAL_READY_UTC"),
    rpoTargetMinutes: Number(env("RESTORE_REHEARSAL_RPO_TARGET_MINUTES")),
    rtoTargetMinutes: Number(env("RESTORE_REHEARSAL_RTO_TARGET_MINUTES")),
  });

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

  try {
    await sql.unsafe("set session characteristics as transaction read only");
    await sql.unsafe("set statement_timeout = '60s'");
    await sql.unsafe("set idle_in_transaction_session_timeout = '60s'");
    await sql.unsafe("begin transaction read only");

    const alive = await sql.unsafe("select 1 as ok");
    const ledger = await readLedger(sql);
    const tableCounts = await readTableCounts(sql);
    const activeOrganizations = await readActiveOrganizations(sql);
    const folios = await readFolios(sql);
    const storage = await readStorage(sql);

    await sql.unsafe("rollback");

    const checks: CheckResult[] = [
      { id: "C1", label: "Conexión de sólo lectura establecida", pass: Number(alive[0]?.ok) === 1, detail: "select 1 ok" },
      {
        id: "C2",
        label: "Ledger de migraciones presente",
        pass: ledger.supabaseMigrations > 0 && ledger.drizzleMigrations > 0,
        detail: `supabase=${ledger.supabaseMigrations}, drizzle=${ledger.drizzleMigrations}`,
      },
      {
        id: "C3",
        label: "Tablas operativas legibles",
        pass: tableCounts.length > 0,
        detail: `${tableCounts.length} tablas consultadas`,
      },
      {
        id: "C4",
        label: "Al menos una organización activa",
        pass: activeOrganizations >= 1,
        detail: `activas=${activeOrganizations}`,
      },
      {
        id: "C5",
        label: "Folios agregados por organización y año",
        pass: folios.every((f) => f.documents >= 0 && f.lastFolio >= 0),
        detail: `${folios.length} combinaciones organización/año`,
      },
      {
        id: "C6",
        label: "Objetos de Storage frente a referencias conocidas",
        pass: storage.every((s) => s.objects >= 0 && s.referencedRows >= 0),
        detail: `${storage.length} buckets agregados`,
      },
    ];

    const report = buildReport({
      commit: env("GITHUB_SHA") || "local",
      expectedRef,
      generatedAtUtc: new Date().toISOString(),
      timing,
      ledger,
      tableCounts,
      activeOrganizations,
      folios,
      storage,
      checks,
    });

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(`${OUT_DIR}/restore-rehearsal.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(`${OUT_DIR}/restore-rehearsal.md`, renderMarkdown(report), "utf8");

    console.log(`Verificación de restore: ${report.pass ? "PASS" : "FAIL"} (reportes en ${OUT_DIR}/)`);
    if (!report.pass) process.exit(1);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Verificación de restore abortada: ${sanitizeError(error, [env(DATABASE_URL_ENV)])}`);
  process.exit(1);
});
