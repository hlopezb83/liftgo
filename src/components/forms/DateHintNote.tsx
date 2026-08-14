import { nonBusinessDayNote } from "@/lib/date/holidaysMx";
import { formatMtyCalendarDate } from "@/lib/date/mtyCalendarDate";

/**
 * Nota informativa (no bloqueante) cuando la fecha cae en fin de semana o
 * día festivo/inhábil bancario en México.
 */
export function DateHintNote({ date, id }: { date?: Date; id?: string }) {
  const note = nonBusinessDayNote(date);
  if (!date || !note) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {formatMtyCalendarDate(date)} — {note}
    </p>
  );
}
