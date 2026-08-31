
import { eachDayOfInterval, parseISO, differenceInDays } from "date-fns";
import type { BookingWithForklift } from "@/features/bookings";
import { rentalDaysInclusive } from "@/features/bookings";

const BOOKING_COLORS = [
  "hsl(var(--gantt-1))", "hsl(var(--gantt-2))", "hsl(var(--gantt-3))", "hsl(var(--gantt-4))",
  "hsl(var(--gantt-5))", "hsl(var(--gantt-6))", "hsl(var(--gantt-7))", "hsl(var(--gantt-8))",
];

export function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return BOOKING_COLORS[Math.abs(h) % BOOKING_COLORS.length];
}

export interface BarSegment {
  booking: BookingWithForklift;
  leftPercent: number;
  widthPercent: number;
  color: string;
  label: string;
  durationDays: number;
}

/**
 * A5-07: ventana de mantenimiento que se dibuja como capa sobre la fila del
 * equipo, para que al programar una renta se vea que la unidad ya está
 * comprometida por servicio. Es sólo visualización: no crea reglas nuevas.
 */
export interface MaintenanceWindow {
  id: string;
  forklift_id: string;
  date: string;
  label: string;
}

export interface MaintenanceSegment {
  id: string;
  leftPercent: number;
  widthPercent: number;
  label: string;
  date: string;
}

export function useGanttSegments(
  bookings: BookingWithForklift[] | undefined,
  rangeStart: Date,
  rangeEnd: Date,
  maintenanceWindows?: MaintenanceWindow[],
  /**
   * A5-07: días de holgura alrededor del próximo servicio. Es el mismo valor
   * configurable (`company_settings.maintenance_buffer_days`) que usan las RPC
   * de reservas, para que el Gantt dibuje la ventana real de bloqueo y no un
   * marcador de un solo día.
   */
  maintenanceBufferDays = 0,
) {

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const totalDays = days.length;

  const bookingsByForklift = (() => {
    const map = new Map<string, BookingWithForklift[]>();
    bookings?.forEach((b) => {
      const list = map.get(b.forklift_id);
      if (list) list.push(b);
      else map.set(b.forklift_id, [b]);
    });
    return map;
  })();

  const getSegments = (forkliftId: string): BarSegment[] => {
    const fBookings = bookingsByForklift.get(forkliftId) || [];
    const segments: BarSegment[] = [];
    for (const b of fBookings) {
      if (b.status !== "confirmed" && b.status !== "completed" && b.status !== "cancelled") continue;
      const bStart = parseISO(b.start_date);
      const bEnd = parseISO(b.end_date);
      if (bEnd < rangeStart || bStart > rangeEnd) continue;
      const clampedStart = bStart < rangeStart ? rangeStart : bStart;
      const clampedEnd = bEnd > rangeEnd ? rangeEnd : bEnd;
      const startIdx = differenceInDays(clampedStart, rangeStart);
      const endIdx = differenceInDays(clampedEnd, rangeStart);
      const span = endIdx - startIdx + 1;
      segments.push({
        booking: b,
        leftPercent: (startIdx / totalDays) * 100,
        widthPercent: (span / totalDays) * 100,
        color: hashColor(b.customer_name || "Sin cliente"),
        label: b.customer_name || "Sin cliente",
        durationDays: rentalDaysInclusive(bStart, bEnd),
      });
    }
    return segments;
  };

  const maintenanceByForklift = (() => {
    const map = new Map<string, MaintenanceWindow[]>();
    maintenanceWindows?.forEach((m) => {
      const list = map.get(m.forklift_id);
      if (list) list.push(m);
      else map.set(m.forklift_id, [m]);
    });
    return map;
  })();

  const getMaintenanceSegments = (forkliftId: string): MaintenanceSegment[] => {
    const items = maintenanceByForklift.get(forkliftId) || [];
    const buffer = Math.max(0, Math.trunc(maintenanceBufferDays));
    const segments: MaintenanceSegment[] = [];
    for (const m of items) {
      const day = parseISO(m.date);
      const winStart = addDays(day, -buffer);
      const winEnd = addDays(day, buffer);
      if (winEnd < rangeStart || winStart > rangeEnd) continue;
      const clampedStart = winStart < rangeStart ? rangeStart : winStart;
      const clampedEnd = winEnd > rangeEnd ? rangeEnd : winEnd;
      const startIdx = differenceInDays(clampedStart, rangeStart);
      const span = differenceInDays(clampedEnd, clampedStart) + 1;
      segments.push({
        id: m.id,
        leftPercent: (startIdx / totalDays) * 100,
        widthPercent: (span / totalDays) * 100,
        label: buffer > 0 ? `${m.label} (±${buffer} d)` : m.label,
        date: m.date,
      });
    }
    return segments;
  };


  const customerColorMap = (() => {
    const map = new Map<string, string>();
    bookings?.forEach((b) => {
      if (!b.customer_name || map.has(b.customer_name)) return;
      const bStart = parseISO(b.start_date);
      const bEnd = parseISO(b.end_date);
      if (bEnd >= rangeStart && bStart <= rangeEnd) {
        map.set(b.customer_name, hashColor(b.customer_name));
      }
    });
    return map;
  })();

  return { days, totalDays, getSegments, getMaintenanceSegments, customerColorMap };
}
