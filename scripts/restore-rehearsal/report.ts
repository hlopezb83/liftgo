import { findSensitiveLeak } from "./masking";
import type { TimingResult } from "./timing";

export const REPORT_SCHEMA = "liftgo.restore-rehearsal";
export const REPORT_SCHEMA_VERSION = 1;
export const MASKED_TARGET = "isolated-restore-target";

export interface TableCount { table: string; rows: number }
export interface FolioAggregate { org: string; year: number; documents: number; lastFolio: number }
export interface StorageAggregate { bucket: string; objects: number; referencedRows: number }
export interface LedgerState {
  supabaseMigrations: number;
  drizzleMigrations: number;
  lastSupabaseVersion: string | null;
  lastDrizzleHashPrefix: string | null;
}
export interface CheckResult { id: string; label: string; pass: boolean; detail: string }
export interface ReportInput {
  commit: string;
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
  target: typeof MASKED_TARGET;
  pass: boolean;
}

export function buildReport(input: ReportInput): RestoreRehearsalReport {
  const report: RestoreRehearsalReport = {
    schema: REPORT_SCHEMA,
    schemaVersion: REPORT_SCHEMA_VERSION,
    target: MASKED_TARGET,
    ...input,
    pass: input.timing.pass && input.checks.every((check) => check.pass),
  };
  const leak = findSensitiveLeak(JSON.stringify(report));
  if (leak) throw new Error(`El reporte contiene datos sensibles (${leak}); se aborta antes de escribirlo.`);
  return report;
}

function table(headers: string[], rows: (string | number)[][]): string {
  const safe = (value: string | number) => String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
  return [
    `| ${headers.map(safe).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`),
  ].join("\n");
}

export function renderMarkdown(report: RestoreRehearsalReport): string {
  const timing = report.timing;
  return [
    "# Verificacion de restore en instancia aislada",
    "",
    `- Esquema: \`${report.schema}\` v${report.schemaVersion}`,
    `- Commit: \`${report.commit}\``,
    `- Destino: \`${report.target}\``,
    `- Generado (UTC): ${report.generatedAtUtc}`,
    `- Resultado global: **${report.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Ventana del ensayo y objetivos",
    "",
    table(["Metrica", "Valor", "Objetivo", "Resultado"], [
      ["Backup UTC", timing.backupTimestampUtc, "-", "-"],
      ["Incidente UTC", timing.incidentTimestampUtc, "-", "-"],
      ["Inicio restore UTC", timing.restoreStartedUtc, "-", "-"],
      ["Copia lista UTC", timing.restoreReadyUtc, "-", "-"],
      ["RPO (min)", timing.rpoMinutes, timing.rpoTargetMinutes, timing.rpoPass ? "PASS" : "FAIL"],
      ["RTO (min)", timing.rtoMinutes, timing.rtoTargetMinutes, timing.rtoPass ? "PASS" : "FAIL"],
    ]),
    "",
    "## Comprobaciones",
    "",
    table(["ID", "Comprobacion", "Resultado", "Detalle"], report.checks.map((check) => [check.id, check.label, check.pass ? "PASS" : "FAIL", check.detail])),
    "",
    "## Ledger de migraciones",
    "",
    `- Migraciones Supabase: ${report.ledger.supabaseMigrations}`,
    `- Migraciones Drizzle: ${report.ledger.drizzleMigrations}`,
    `- Ultima version Supabase: ${report.ledger.lastSupabaseVersion ?? "-"}`,
    `- Ultimo hash Drizzle (prefijo): ${report.ledger.lastDrizzleHashPrefix ?? "-"}`,
    "",
    "## Conteos agregados",
    "",
    table(["Tabla", "Filas"], report.tableCounts.map((entry) => [entry.table, entry.rows])),
    "",
    `Organizaciones activas: **${report.activeOrganizations}**`,
    "",
    "## Folios por organizacion y ano",
    "",
    table(["Organizacion", "Ano", "Documentos", "Ultimo folio"], report.folios.map((folio) => [folio.org, folio.year, folio.documents, folio.lastFolio])),
    "",
    "## Storage: objetos vs referencias conocidas",
    "",
    table(["Bucket", "Objetos", "Referencias"], report.storage.map((entry) => [entry.bucket, entry.objects, entry.referencedRows])),
    "",
    "> Comparacion agregada. El reporte no contiene UUID, nombres, correos, rutas,",
    "> proyecto/host, tokens ni cadena de conexion.",
    "",
  ].join("\n");
}

