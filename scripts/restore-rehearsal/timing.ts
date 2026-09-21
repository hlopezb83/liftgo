/** Calculo puro y determinista de RPO/RTO del ensayo de restore. */

export interface TimingInput {
  backupTimestampUtc: string;
  incidentTimestampUtc: string;
  restoreStartedUtc: string;
  restoreReadyUtc: string;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
}

export interface TimingResult extends TimingInput {
  rpoMinutes: number;
  rtoMinutes: number;
  rpoPass: boolean;
  rtoPass: boolean;
  pass: boolean;
}

function parseUtc(label: string, value: string): Date {
  const normalized = String(value);
  if (!normalized.endsWith("Z")) throw new Error(`${label} debe estar expresado en UTC y terminar en Z.`);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} no es una fecha UTC ISO-8601 valida.`);
  return date;
}

function positive(label: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
  return value;
}

function minutes(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 60000) * 100) / 100;
}

export function computeTiming(input: TimingInput): TimingResult {
  const backup = parseUtc("backup_timestamp_utc", input.backupTimestampUtc);
  const incident = parseUtc("incident_timestamp_utc", input.incidentTimestampUtc);
  const started = parseUtc("restore_started_utc", input.restoreStartedUtc);
  const ready = parseUtc("restore_ready_utc", input.restoreReadyUtc);

  if (incident < backup) throw new Error("El incidente no puede ser anterior al backup.");
  if (started < incident) throw new Error("restore_started_utc no puede ser anterior al incidente.");
  if (ready < started) throw new Error("restore_ready_utc no puede ser anterior al inicio del restore.");

  const rpoTargetMinutes = positive("rpo_target_minutes", input.rpoTargetMinutes);
  const rtoTargetMinutes = positive("rto_target_minutes", input.rtoTargetMinutes);
  const rpoMinutes = minutes(backup, incident);
  const rtoMinutes = minutes(started, ready);
  const rpoPass = rpoMinutes <= rpoTargetMinutes;
  const rtoPass = rtoMinutes <= rtoTargetMinutes;

  return {
    backupTimestampUtc: backup.toISOString(),
    incidentTimestampUtc: incident.toISOString(),
    restoreStartedUtc: started.toISOString(),
    restoreReadyUtc: ready.toISOString(),
    rpoTargetMinutes,
    rtoTargetMinutes,
    rpoMinutes,
    rtoMinutes,
    rpoPass,
    rtoPass,
    pass: rpoPass && rtoPass,
  };
}

