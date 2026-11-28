import { getDay, isSameDay, startOfWeek } from "date-fns";
import { useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { Tables } from "@/integrations/supabase/types";
import { BOOKING_STATUS } from "@/lib/constants";
import { useLocation } from "@/lib/router-compat";
import { formatMtyDate } from "@/lib/utils";
import type { BarSegment, MaintenanceSegment } from "../hooks/useGanttSegments";

const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  pending: "Pendiente",
};


interface Props {
  forklift: Tables<"forklifts">;
  segments: BarSegment[];
  days: Date[];
  maintenanceSegments?: MaintenanceSegment[];
  canOpenBookings: boolean;
}

export function GanttRow({ forklift, segments, days, maintenanceSegments = [], canOpenBookings }: Props) {
  const navigate = useNavigateTransition();
  const location = useLocation();
  return (
    <div className="flex items-center border-b py-1.5 hover:bg-muted/30">
      <div className="w-48 shrink-0 pr-2">
        <span className="text-xs font-mono font-medium truncate block" title={forklift.name}>
          {forklift.name}
        </span>
      </div>
      <div className="flex-1 relative" style={{ height: "24px" }}>
        <div className="absolute inset-0 flex">
          {days.map((day) => {
            const wd = getDay(day);
            const isWeekend = wd === 0 || wd === 6;
            const weekStart = isSameDay(day, startOfWeek(day, { weekStartsOn: 1 }));
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 ${isWeekend ? "bg-muted/20" : ""} ${weekStart ? "border-l border-border" : ""}`}
              />
            );
          })}
        </div>
        {/* A5-07: capa de mantenimiento programado debajo de las barras de renta. */}
        {maintenanceSegments.map((segment) => <MaintenanceBar key={segment.id} segment={segment} />)}
        {segments.map((segment) => (
          <BookingBar
            key={segment.booking.id}
            segment={segment}
            onOpen={canOpenBookings ? () => {
              if (location.pathname !== "/calendar") return;
              navigate("/bookings/" + segment.booking.id, {
                state: { calendarReturnTo: location.pathname + location.search },
              });
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function MaintenanceBar({ segment }: { segment: MaintenanceSegment }) {
  const [open, setOpen] = useState(false);
  const date = formatMtyDate(segment.date);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={"Mantenimiento: " + segment.label + ", " + date}
          className="absolute top-0 h-6 rounded-sm border border-warning/60 bg-[repeating-linear-gradient(45deg,hsl(var(--warning)/0.55)_0px,hsl(var(--warning)/0.55)_3px,transparent_3px,transparent_6px)] focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: segment.leftPercent + "%", width: segment.widthPercent + "%" }}
          onClick={(event) => { event.preventDefault(); setOpen(true); }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="space-y-1 text-xs">
        <p className="font-semibold">Mantenimiento</p>
        <p>{segment.label}</p>
        <p className="text-muted-foreground">{date}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function BookingBar({ segment, onOpen }: { segment: BarSegment; onOpen?: () => void }) {
  const isConfirmed = segment.booking.status === BOOKING_STATUS.confirmed;
  const className = "absolute top-0.5 h-5 flex items-center overflow-hidden rounded-sm " +
    (isConfirmed ? "" : "border border-dashed border-foreground/30 opacity-30");
  const style = { left: segment.leftPercent + "%", width: segment.widthPercent + "%", background: segment.color };
  const period = formatMtyDate(segment.booking.start_date, "dd/MM") + " → " + formatMtyDate(segment.booking.end_date);
  const label = segment.durationDays > 3 && (
    <span className="truncate px-1 text-3xs font-medium text-primary-foreground drop-shadow-sm">{segment.label}</span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onOpen ? (
          <button type="button" aria-label={"Abrir reserva " + segment.label} onClick={onOpen}
            className={className + " cursor-pointer transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"} style={style}>
            {label}
          </button>
        ) : (
          <div role="img" aria-label={"Reserva " + segment.label + ", " + period} className={className} style={style}>
            {label}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="space-y-1 text-xs">
        <p className="font-semibold">{segment.label}</p>
        <p>{period}</p>
        <p className="text-muted-foreground">
          {segment.durationDays} día{segment.durationDays !== 1 ? "s" : ""} ·{" "}
          {BOOKING_STATUS_LABELS[segment.booking.status] || segment.booking.status}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
