import { format, getDay, isToday } from "date-fns";
import { es } from "date-fns/locale";

export function GanttHeader({ days }: { days: Date[] }) {
  return (
    <>
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
    </>
  );
}
