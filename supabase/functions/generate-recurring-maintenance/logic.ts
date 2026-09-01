// R8-01 / R8-07 / R8-08: núcleo del catch-up mensual de pólizas de
// mantenimiento, extraído de index.ts para poder probarlo sin red.
//
// Invariante: la generación mensual es estrictamente secuencial, idempotente y
// monótona bajo concurrencia.
//   · El claim (`claim_maintenance_policy_month`) sólo avanza hacia adelante.
//   · Un choque con el índice único parcial (policy_id, policy_month) → 23505 →
//     significa que ese mes YA fue generado: se trata como éxito (R8-01).
//   · El rollback ante otros errores es compare-and-set sobre el mes que esta
//     corrida reclamó, así una corrida concurrente nunca retrocede (R8-07).
//   · Un fallo al reclamar corta el catch-up de la póliza: continuar a meses
//     posteriores dejaría un hueco permanente (R8-08).

export interface MaintenancePolicyRow {
  id: string;
  forklift_id: string;
  service_type: string;
  description: string | null;
  provider_name: string | null;
  monthly_cost: number;
  last_generated_month: string | null;
  forklifts?: { name?: string | null; status?: string | null } | null;
}

export interface PostgrestErrorLike {
  message?: string;
  code?: string;
}

export interface MaintenanceClientLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: boolean | null; error: PostgrestErrorLike | null }>;
  from(table: string): {
    insert(
      row: Record<string, unknown>,
    ): Promise<{ error: PostgrestErrorLike | null }>;
    update(patch: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        eq(
          column: string,
          value: unknown,
        ): Promise<{ error: PostgrestErrorLike | null }>;
      };
    };
  };
}

/** Blindaje ante datos corruptos / pólizas muy antiguas. */
export const MAX_CATCHUP_MONTHS = 12;

/** Código Postgres de violación de índice único. */
export const UNIQUE_VIOLATION = "23505";

export function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${
    String(d.getUTCMonth() + 1).padStart(2, "0")
  }`;
}

export function pendingMonthsFor(
  lastGeneratedMonth: string | null,
  currentMonth: string,
): string[] {
  const months: string[] = [];
  let cursor = lastGeneratedMonth ? nextMonth(lastGeneratedMonth) : currentMonth;
  while (cursor <= currentMonth && months.length < MAX_CATCHUP_MONTHS) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

export interface GenerationResult {
  generated: number;
  skipped: number;
  details: string[];
}

export async function generateForPolicies(
  supabase: MaintenanceClientLike,
  candidates: MaintenancePolicyRow[],
  currentMonth: string,
): Promise<GenerationResult> {
  let generated = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const policy of candidates) {
    let lastOkMonth = policy.last_generated_month;

    for (const month of pendingMonthsFor(lastOkMonth, currentMonth)) {
      const monthFirstDay = `${month}-01`;

      const { data: claimed, error: claimErr } = await supabase.rpc(
        "claim_maintenance_policy_month",
        { p_policy_id: policy.id, p_month: month },
      );

      if (claimErr) {
        // R8-08: NO continuar a meses posteriores. Saltarse este mes y
        // reclamar el siguiente movería `last_generated_month` hacia adelante
        // dejando un hueco que ningún catch-up posterior podría llenar.
        details.push(
          `Error al reclamar ${policy.id} (${month}): ${claimErr.message}`,
        );
        break;
      }
      if (claimed !== true) {
        skipped += 1;
        continue;
      }

      // BL-40: el log queda 'scheduled'; no carga P&L hasta que el mecánico lo
      // confirme como 'completed'.
      // FIX-R2-02 (N2): el importe va en manual_cost y NO se escribe
      // next_service_date (no debe activar el buffer de disponibilidad ±3d).
      const { error: insertErr } = await supabase
        .from("maintenance_logs")
        .insert({
          forklift_id: policy.forklift_id,
          service_type: policy.service_type,
          description: policy.description ||
            `Póliza mensual - ${policy.provider_name}`,
          manual_cost: policy.monthly_cost,
          performed_by: policy.provider_name,
          performed_at: monthFirstDay,
          work_status: "scheduled",
          policy_id: policy.id,
          policy_month: month,
        });

      if (insertErr?.code === UNIQUE_VIOLATION) {
        // R8-01: el log de ese mes ya existe (reintento / corrida concurrente).
        // Es un éxito idempotente: avanzamos el cursor y seguimos el catch-up.
        lastOkMonth = month;
        skipped += 1;
        details.push(
          `= ${policy.forklifts?.name ?? "(sin nombre)"} (${monthFirstDay}) — ya generado`,
        );
        continue;
      }

      if (insertErr) {
        // R8-07: rollback compare-and-set. Sólo retrocedemos si
        // `last_generated_month` sigue siendo el mes que ESTA corrida reclamó;
        // si otra corrida ya avanzó, no la movemos hacia atrás.
        await supabase
          .from("maintenance_policies")
          .update({ last_generated_month: lastOkMonth })
          .eq("id", policy.id)
          .eq("last_generated_month", month);
        details.push(
          `Error al insertar log ${policy.id} (${month}): ${insertErr.message}`,
        );
        break;
      }

      lastOkMonth = month;
      generated += 1;
      details.push(
        `✓ ${policy.forklifts?.name ?? "(sin nombre)"} (${monthFirstDay})`,
      );
    }
  }

  return { generated, skipped, details };
}
