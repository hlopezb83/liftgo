/**
 * Construcción y render del reporte del ensayo de restore.
 * Sólo agregados y etiquetas enmascaradas: ningún dato personal.
 */

import { findSensitiveLeak } from "./masking";
import type { TimingResult } from "./timing";

export const REPORT_SCHEMA = "liftgo.restore-rehearsal";
export const REPORT_SCHEMA_VERSION = 1;

export interface TableCount {
  table: string;
  rows: number;
}

export interface FolioAggregate {
  org: string;
  year: number;
  documents: number;
  lastFolio: number;
}

export interface StorageAggregate {
  bucket: string;
  objects: number;
  referencedRows: number;
}

export interface LedgerState {
  supabaseMigrations: number;
  drizzleMigrations: number;
  lastSupabaseVersion: string | null;
  lastDrizzleHashPrefix: string | null;
}

export interface CheckResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface ReportInput {
  commit: string;
  expectedRef: string;
  generatedAtUtc: string;
  timing: TimingResult;
  ledger: LedgerState;
  tableCounts: TableCount[];
  activeOrganizations: number;
  folios: FolioAggregate[];
  storage: StorageAggregate[];
  checks: CheckResult[];
}

export interface RestoreRehearsalReport extends ReportInput {
  schema: string;
  schemaVersion: number;
  pass: boolean;
}

export function buildReport(input: ReportInput): RestoreRehearsalReport {
  const pass = input.timing.pass && input.checks.every((check) => check.pass);
  const report: RestoreRehearsalReport = {
    schema: REPORT_SCHEMA,
    schemaVersion: REPORT_SCHEMA_VERSION,
    ...input,
    pass,
  };

  const leak = findSensitiveLeak(JSON.stringify(report));
  if (leak) {
    throw new Error(`El reporte contiene datos sensibles (${leak}); se aborta antes de escribirlo.`);
  }
  return report;
}

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

export function renderMarkdown(report: RestoreRehearsalReport): string {
  const t = report.timing;
  const lines: string[] = [
    "# Verificación de restore en instancia aislada",
    "",
    `- Esquema: \`${report.schema}\` v${report.schemaVersion}`,
    `- Commit: \`${report.commit}\``,
    `- Instancia esperada: \`${report.expectedRef}\``,
    `- Generado (UTC): ${report.generatedAtUtc}`,
    `- Resultado global: **${report.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Ventana del ensayo (UTC) y objetivos",
    "",
    table(
      ["Métrica", "Valor", "Objetivo", "Resultado"],
      [
        ["Backup", t.backupTimestampUtc, "—", "—"],
        ["Inicio de restore", t.restoreStartedUtc, "—", "—"],
        ["Copia lista", t.restoreReadyUtc, "—", "—"],
        ["RPO (min)", t.rpoMinutes, t.rpoTargetMinutes, t.rpoPass ? "PASS" : "FAIL"],
        ["RTO (min)", t.rtoMinutes, t.rtoTargetMinutes, t.rtoPass ? "PASS" : "FAIL"],
      ],
    ),
    "",
    "## Comprobaciones",
    "",
    table(
      ["ID", "Comprobación", "Resultado", "Detalle"],
      report.checks.map((c) => [c.id, c.label, c.pass ? "PASS" : "FAIL", c.detail]),
    ),
    "",
    "## Ledger de migraciones",
    "",
    `- Migraciones Supabase aplicadas: ${report.ledger.supabaseMigrations}`,
    `- Migraciones Drizzle aplicadas: ${report.ledger.drizzleMigrations}`,
    `- Última versión Supabase: ${report.ledger.lastSupabaseVersion ?? "—"}`,
    `- Último hash Drizzle (prefijo): ${report.ledger.lastDrizzleHashPrefix ?? "—"}`,
    "",
    "## Conteos agregados por tabla",
    "",
    table(["Tabla", "Filas"], report.tableCounts.map((c) => [c.table, c.rows])),
    "",
    `Organizaciones activas: **${report.activeOrganizations}**`,
    "",
    "## Últimos folios por organización y año (etiquetas enmascaradas)",
    "",
    table(
      ["Organización", "Año", "Documentos", "Último folio"],
      report.folios.map((f) => [f.org, f.year, f.documents, f.lastFolio]),
    ),
    "",
    "## Storage: objetos vs referencias conocidas",
    "",
    table(
      ["Bucket", "Objetos", "Referencias en base"],
      report.storage.map((s) => [s.bucket, s.objects, s.referencedRows]),
    ),
    "",
    "> Reporte agregado y enmascarado: no contiene UUID, nombres, correos,",
    "> rutas de Storage, tokens ni cadenas de conexión.",
    "",
  ];
  return lines.join("\n");
}
