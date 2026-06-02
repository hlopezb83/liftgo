import { getDay, isToday, isSameDay, startOfWeek } from "date-fns";

interface Props {
  label: string;
  count: number;
  days: Date[];
}

export function GanttGroupedRow({ label, count, days }: Props) {
  return (
    <div className="flex items-center border-b py-1 bg-muted/10 hover:bg-muted/30">
      <div className="w-48 shrink-0 flex items-center gap-2 pr-2">
        <span className="text-xs font-mono text-muted-foreground truncate">{label}</span>
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          × {count}
        </span>
      </div>
      <div className="flex-1 relative" style={{ height: "20px" }}>
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
      </div>
    </div>
  );
}
