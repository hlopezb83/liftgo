import { useMemo } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { format, eachDayOfInterval, isWithinInterval, parseISO, differenceInDays, isToday, getDay } from "date-fns";
import { es } from "date-fns/locale";
import type { BookingWithForklift } from "@/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";

type Forklift = Tables<"forklifts">;

const BOOKING_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(280, 65%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 75%, 55%)",
  "hsl(190, 80%, 45%)",
  "hsl(60, 70%, 45%)",
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return BOOKING_COLORS[Math.abs(h) % BOOKING_COLORS.length];
}

interface GanttChartProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
  rangeStart: Date;
  rangeEnd: Date;
}

interface BarSegment {
  booking: BookingWithForklift;
  leftPercent: number;
  widthPercent: number;
  color: string;
  label: string;
  durationDays: number;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  pending: "Pendiente",
};

export function GanttChart({ forklifts, bookings, rangeStart, rangeEnd }: GanttChartProps) {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const totalDays = days.length;

  const bookingsByForklift = useMemo(() => {
    const map = new Map<string, BookingWithForklift[]>();
    bookings?.forEach((b) => {
      const list = map.get(b.forklift_id);
      if (list) list.push(b);
      else map.set(b.forklift_id, [b]);
    });
    return map;
  }, [bookings]);

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
        durationDays: differenceInDays(bEnd, bStart) + 1,
      });
    }
    return segments;
  };

  // Color legend
  const customerColorMap = useMemo(() => {
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
  }, [bookings, rangeStart, rangeEnd]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Day-of-week header */}
        <div className="flex border-b pb-1 mb-0">
          <div className="w-48 shrink-0" />
          <div className="flex-1 flex">
            {days.map((day) => {
              const wd = getDay(day);
              const isWeekend = wd === 0 || wd === 6;
              return (
                <div
                  key={`wd-${day.toISOString()}`}
                  className={`flex-1 text-center text-[9px] font-medium ${isWeekend ? "text-destructive/60" : "text-muted-foreground/60"}`}
                >
                  {format(day, "EEE", { locale: es })}
                </div>
              );
            })}
          </div>
        </div>
        {/* Day number header */}
        <div className="flex border-b pb-2 mb-2">
          <div className="w-48 shrink-0 text-xs font-medium text-muted-foreground">Montacargas</div>
          <div className="flex-1 flex">
            {days.map((day) => {
              const wd = getDay(day);
              const isWeekend = wd === 0 || wd === 6;
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`flex-1 text-center text-[10px] ${today ? "font-bold text-primary" : isWeekend ? "text-destructive/60" : "text-muted-foreground"}`}
                >
                  {today ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                      {format(day, "d")}
                    </span>
                  ) : (
                    format(day, "d")
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Forklift rows */}
        {forklifts?.map((fl) => {
          const segments = getSegments(fl.id);
          return (
            <div key={fl.id} className="flex items-center border-b py-1.5 hover:bg-muted/30">
              <div className="w-48 shrink-0 flex items-center gap-2 pr-2">
                <span className="text-xs font-mono font-medium">{fl.name}</span>
                <StatusBadge status={fl.status} />
              </div>
              <div className="flex-1 relative" style={{ height: "24px" }}>
                {/* Background grid */}
                <div className="absolute inset-0 flex">
                  {days.map((day) => {
                    const wd = getDay(day);
                    const isWeekend = wd === 0 || wd === 6;
                    const today = isToday(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={`flex-1 ${isWeekend ? "bg-muted/20" : ""} ${today ? "bg-primary/5" : ""}`}
                      />
                    );
                  })}
                </div>
                {/* Booking bars */}
                {segments.map((seg) => {
                  const isConfirmed = seg.booking.status === "confirmed";
                  const showLabel = seg.durationDays > 3;
                  return (
                    <Tooltip key={seg.booking.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute top-0.5 h-5 rounded-sm flex items-center overflow-hidden cursor-default ${!isConfirmed ? "opacity-30 border border-dashed border-foreground/30" : ""}`}
                          style={{
                            left: `${seg.leftPercent}%`,
                            width: `${seg.widthPercent}%`,
                            background: seg.color,
                          }}
                        >
                          {showLabel && (
                            <span className="text-[9px] text-white font-medium px-1 truncate drop-shadow-sm">
                              {seg.label}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs space-y-1">
                        <p className="font-semibold">{seg.label}</p>
                        <p>
                          {format(parseISO(seg.booking.start_date), "d MMM", { locale: es })} →{" "}
                          {format(parseISO(seg.booking.end_date), "d MMM yyyy", { locale: es })}
                        </p>
                        <p className="text-muted-foreground">
                          {seg.durationDays} día{seg.durationDays !== 1 ? "s" : ""} ·{" "}
                          {STATUS_LABELS[seg.booking.status] || seg.booking.status}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Color legend */}
      {customerColorMap.size > 0 && (
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
          {Array.from(customerColorMap.entries()).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
