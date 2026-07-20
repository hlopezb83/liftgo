import { toYMD } from "@/lib/date/toYMD";

export interface ModelRow {
  model: string;
  units: number;
  revenue: number;
  maintenance: number;
  damages: number;
  profit: number;
  margin: number;
}

export interface Forklift { id: string; name: string; manufacturer?: string | null; model?: string | null }
export interface Booking { id: string; forklift_id: string }
export interface Invoice { status: string; paid_at: string | null; booking_id: string | null; total: number | string }
export interface MaintLog { forklift_id: string; performed_at: string | null; cost: number | string | null }
export interface DamageRec { forklift_id: string; created_at: string | null; actual_cost: number | string | null }

/**
 * EC-M1: comparación día-a-día basada en strings YMD (no en Date/UTC) para evitar
 * off-by-one cuando columnas `date` de Postgres (que llegan como "YYYY-MM-DD") se
 * parsean como UTC medianoche y se comparan contra rangos locales (America/Monterrey).
 *
 * Extraemos los primeros 10 chars — funciona para `date` puros ("2026-03-15") y para
 * `timestamptz` ISO ("2026-03-15T18:00:00Z") ya que sólo comparamos el día calendario.
 */
function inRange(dateStr: string | null | undefined, start: Date, end: Date) {
  if (!dateStr) return false;
  const startYMD = toYMD(start);
  const endYMD = toYMD(end);
  const dayYMD = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
  return dayYMD >= startYMD && dayYMD <= endYMD;
}


export function buildModelUnitsMap(forklifts: Forklift[]) {
  const forkliftModel = new Map<string, string>();
  const modelUnits = new Map<string, Set<string>>();
  for (const f of forklifts) {
    const key = [f.manufacturer, f.model].filter(Boolean).join(" ") || f.name;
    forkliftModel.set(f.id, key);
    if (!modelUnits.has(key)) modelUnits.set(key, new Set());
    modelUnits.get(key)?.add(f.id);
  }
  return { forkliftModel, modelUnits };
}

export function buildRevenueMap(invoices: Invoice[], bookings: Booking[], start: Date, end: Date) {
  const bookingForklift = new Map<string, string>();
  for (const b of bookings) bookingForklift.set(b.id, b.forklift_id);
  const map = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid" || !inRange(inv.paid_at, start, end)) continue;
    const fId = inv.booking_id ? bookingForklift.get(inv.booking_id) : undefined;
    if (!fId) continue;
    map.set(fId, (map.get(fId) || 0) + Number(inv.total));
  }
  return map;
}

export function buildCostMap<T extends { forklift_id: string }>(
  items: T[],
  dateOf: (i: T) => string | null,
  costOf: (i: T) => number,
  start: Date,
  end: Date,
) {
  const map = new Map<string, number>();
  for (const it of items) {
    if (!inRange(dateOf(it), start, end)) continue;
    map.set(it.forklift_id, (map.get(it.forklift_id) || 0) + costOf(it));
  }
  return map;
}

export function aggregateRows(
  modelUnits: Map<string, Set<string>>,
  revenueByForklift: Map<string, number>,
  maintByForklift: Map<string, number>,
  dmgByForklift: Map<string, number>,
): ModelRow[] {
  const result: ModelRow[] = [];
  for (const [model, ids] of modelUnits) {
    let revenue = 0, maintenance = 0, damages = 0;
    for (const fId of ids) {
      revenue += revenueByForklift.get(fId) || 0;
      maintenance += maintByForklift.get(fId) || 0;
      damages += dmgByForklift.get(fId) || 0;
    }
    const profit = revenue - maintenance - damages;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    result.push({ model, units: ids.size, revenue, maintenance, damages, profit, margin });
  }
  return result;
}
