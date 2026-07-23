import { parseISO, max, min } from "date-fns";
import { rentalDaysInclusive } from "@/features/bookings/lib/rentalDays";
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

export function getUtilColor(pct: number) {
  if (pct > 75) return "hsl(var(--status-available))";
  if (pct >= 40) return "hsl(var(--status-warning))";
  return "hsl(var(--status-overdue))";
}

export function buildUtilizationRows(
  forklifts: Tables<"forklifts">[],
  bookings: Booking[],
  startDate: Date,
  endDate: Date,
): ModelRow[] {
  const rangeDays = Math.max(differenceInDays(endDate, startDate), 1);
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
  return Array.from(groups.entries()).map(([model, units]) => {
    const ids = new Set(units.map((u) => u.id));
    const available = units.filter((u) => u.status === "available").length;
    const rented = units.filter((u) => u.status === "rented").length;
    const relevantBookings = bookings.filter(
      (b) => ids.has(b.forklift_id) && b.status !== "cancelled",
    );
    let bookedDays = 0;
    for (const b of relevantBookings) {
      const bStart = max([parseISO(b.start_date), startDate]);
      const bEnd = min([parseISO(b.end_date), endDate]);
      const overlap = differenceInDays(bEnd, bStart) + 1;
      if (overlap > 0) bookedDays += overlap;
    }
    const totalDays = units.length * rangeDays;
    const utilization = totalDays > 0 ? Math.min(Math.round((bookedDays / totalDays) * 100), 100) : 0;
    return { model, units: units.length, available, rented, bookedDays, totalDays, utilization };
  });
}
