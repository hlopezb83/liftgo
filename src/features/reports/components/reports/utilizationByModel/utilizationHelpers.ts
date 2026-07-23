import { differenceInDays, parseISO, max, min } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

export interface ModelRow {
  model: string;
  units: number;
  available: number;
  rented: number;
  bookedDays: number;
  totalDays: number;
  utilization: number;
}

interface Booking {
  forklift_id: string;
  start_date: string;
  end_date: string;
  status: string | null;
}

const EXCLUDED_STATUSES = ["sold", "retired", "vendido", "retirado"];
const DAY_MS = 86_400_000;

export function getUtilColor(pct: number) {
  if (pct > 75) return "hsl(var(--status-available))";
  if (pct >= 40) return "hsl(var(--status-warning))";
  return "hsl(var(--status-overdue))";
}

/**
 * R12-M9: unión de días calendario por unidad (Set), consistente con
 * UtilizationReport.countUniqueBookedDays. Reservas traslapadas del mismo
 * montacargas cuentan 1 vez; el agregado por modelo suma los días únicos
 * de sus unidades — nunca duplica el mismo día en dos rentas.
 */
function countUniqueDaysForUnit(
  bookings: Booking[],
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const days = new Set<number>();
  const startMs = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime();
  const endMs = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime();
  for (const b of bookings) {
    const bs = max([parseISO(b.start_date), rangeStart]);
    const be = min([parseISO(b.end_date), rangeEnd]);
    const s = Math.max(
      new Date(bs.getFullYear(), bs.getMonth(), bs.getDate()).getTime(),
      startMs,
    );
    const e = Math.min(
      new Date(be.getFullYear(), be.getMonth(), be.getDate()).getTime(),
      endMs,
    );
    if (e < s) continue;
    for (let t = s; t <= e; t += DAY_MS) days.add(t);
  }
  return days.size;
}

export function buildUtilizationRows(
  forklifts: Tables<"forklifts">[],
  bookings: Booking[],
  startDate: Date,
  endDate: Date,
): ModelRow[] {
  const rangeDays = Math.max(differenceInDays(endDate, startDate) + 1, 1);
  const active = forklifts.filter(
    (f) => !EXCLUDED_STATUSES.includes(f.status?.toLowerCase() ?? ""),
  );
  const groups = new Map<string, Tables<"forklifts">[]>();
  for (const f of active) {
    const key = f.manufacturer ? `${f.manufacturer} ${f.model}` : f.name;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  // Índice por unidad para no recorrer bookings por cada modelo.
  const bookingsByUnit = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const arr = bookingsByUnit.get(b.forklift_id) ?? [];
    arr.push(b);
    bookingsByUnit.set(b.forklift_id, arr);
  }
  return Array.from(groups.entries()).map(([model, units]) => {
    const available = units.filter((u) => u.status === "available").length;
    const rented = units.filter((u) => u.status === "rented").length;
    let bookedDays = 0;
    for (const u of units) {
      const unitBookings = bookingsByUnit.get(u.id) ?? [];
      bookedDays += countUniqueDaysForUnit(unitBookings, startDate, endDate);
    }
    const totalDays = units.length * rangeDays;
    const utilization = totalDays > 0 ? Math.min(Math.round((bookedDays / totalDays) * 100), 100) : 0;
    return { model, units: units.length, available, rented, bookedDays, totalDays, utilization };
  });
}

