import { format, getDay, isToday, parseISO, startOfWeek, isSameDay } from "date-fns";
import { formatMtyDate } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/StatusBadge";
import type { Tables } from "@/integrations/supabase/types";
import type { BarSegment } from "@/features/calendar/hooks/calendar/useGanttSegments";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  pending: "Pendiente",
};

interface Props {
  forklift: Tables<"forklifts">;
  segments: BarSegment[];
  days: Date[];
}

export function GanttRow({ forklift, segments, days }: Props) {
  return (
    <div className="flex items-center border-b py-1.5 hover:bg-muted/30">
      <div className="w-48 shrink-0 flex items-center gap-2 pr-2">
        <span className="text-xs font-mono font-medium">{forklift.name}</span>
        <StatusBadge status={forklift.status} />
      </div>
      <div className="flex-1 relative" style={{ height: "24px" }}>
        <div className="absolute inset-0 flex">
          {days.map((day) => {
            const wd = getDay(day);
            const isWeekend = wd === 0 || wd === 6;
            const today = isToday(day);
            const weekStart = isSameDay(day, startOfWeek(day, { weekStartsOn: 1 }));
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 ${isWeekend ? "bg-muted/20" : ""} ${today ? "bg-primary/10 border-x border-primary/30" : ""} ${weekStart && !today ? "border-l border-border" : ""}`}
              />
            );
          })}
        </div>
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
                  {formatMtyDate(seg.booking.start_date, "dd/MM")} →{" "}
                  {formatMtyDate(seg.booking.end_date)}
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
}
