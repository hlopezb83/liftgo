/**
 * Cálculo de RPO/RTO del ensayo de restore. Puro y determinista.
 *
 * RPO = minutos entre el timestamp del backup y el inicio del restore
 *       (dato que se pierde en el peor caso).
 * RTO = minutos entre el inicio del restore y el momento en que la copia
 *       quedó lista para verificarse.
 */

export interface TimingInput {
  backupTimestampUtc: string;
  restoreStartedUtc: string;
  restoreReadyUtc: string;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
}

export interface TimingResult {
  backupTimestampUtc: string;
  restoreStartedUtc: string;
  restoreReadyUtc: string;
  rpoMinutes: number;
  rtoMinutes: number;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  rpoPass: boolean;
  rtoPass: boolean;
  pass: boolean;
}

function parseUtc(label: string, value: string): Date {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} no es una fecha UTC ISO-8601 válida.`);
  }
  return date;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requirePositiveTarget(label: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} debe ser un número de minutos mayor que cero.`);
  }
  return value;
}

export function computeTiming(input: TimingInput): TimingResult {
  const backup = parseUtc("backup_timestamp_utc", input.backupTimestampUtc);
  const started = parseUtc("restore_started_utc", input.restoreStartedUtc);
  const ready = parseUtc("restore_ready_utc", input.restoreReadyUtc);

  if (started.getTime() < backup.getTime()) {
    throw new Error("restore_started_utc no puede ser anterior a backup_timestamp_utc.");
  }
  if (ready.getTime() < started.getTime()) {
    throw new Error("restore_ready_utc no puede ser anterior a restore_started_utc.");
  }

  const rpoTargetMinutes = requirePositiveTarget("rpo_target_minutes", input.rpoTargetMinutes);
  const rtoTargetMinutes = requirePositiveTarget("rto_target_minutes", input.rtoTargetMinutes);

  const rpoMinutes = round2((started.getTime() - backup.getTime()) / 60000);
  const rtoMinutes = round2((ready.getTime() - started.getTime()) / 60000);
  const rpoPass = rpoMinutes <= rpoTargetMinutes;
  const rtoPass = rtoMinutes <= rtoTargetMinutes;

  return {
    backupTimestampUtc: backup.toISOString(),
    restoreStartedUtc: started.toISOString(),
    restoreReadyUtc: ready.toISOString(),
    rpoMinutes,
    rtoMinutes,
    rpoTargetMinutes,
    rtoTargetMinutes,
    rpoPass,
    rtoPass,
    pass: rpoPass && rtoPass,
  };
}
