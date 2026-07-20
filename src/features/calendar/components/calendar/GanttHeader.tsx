import { format, getDay, isToday, startOfWeek, isSameDay } from "date-fns";
import { APP_LOCALE } from "@/lib/format/dateFormats";

function getDayNumberClass(today: boolean, isWeekend: boolean): string {
  if (today) return "font-bold text-primary";
  if (isWeekend) return "text-destructive/60";
  return "text-muted-foreground";
}

export function GanttHeader({ days }: { days: Date[] }) {
  return (
    <>
      {/* Day-of-week header */}
      <div className="flex border-b pt-2 pb-1 mb-0">
        <div className="w-48 shrink-0" />
        <div className="flex-1 flex">
          {days.map((day) => {
            const wd = getDay(day);
            const isWeekend = wd === 0 || wd === 6;
            const weekStart = isSameDay(day, startOfWeek(day, { weekStartsOn: 1 }));
            return (
              <div
                key={`wd-${day.toISOString()}`}
                className={`flex-1 min-w-[28px] text-center text-3xs font-medium ${isWeekend ? "text-destructive/60" : "text-muted-foreground/60"} ${weekStart ? "border-l border-border" : ""}`}
              >
                {format(day, "EEE", { locale: APP_LOCALE })}
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
            const weekStart = isSameDay(day, startOfWeek(day, { weekStartsOn: 1 }));
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 min-w-[28px] text-center text-3xs ${getDayNumberClass(today, isWeekend)} ${weekStart ? "border-l border-border" : ""}`}
              >
                {today ? (
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-3xs"
                    title="Hoy"
                  >
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
    </>
  );
}
