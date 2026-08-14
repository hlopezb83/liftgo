import { useId, useState } from "react";
import { DateHintNote } from "@/components/forms/DateHintNote";
import { MaskedDateInput } from "@/components/forms/MaskedDateInput";
import { CalendarIcon } from "@/components/icons";
import { RequiredMark } from "./RequiredMark";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatMtyCalendarDate } from "@/lib/date/mtyCalendarDate";
import { cn, nowMty } from "@/lib/utils";
import type { Matcher } from "react-day-picker";

const SHORTCUTS_HINT = "Atajos: H = hoy · + / − ajustan el segmento · ← → cambian de segmento";


interface DatePickerFieldProps {
  label: string;
  date?: Date;
  onSelect: (d?: Date) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: Matcher | Matcher[];
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  startMonth?: Date;
  endMonth?: Date;
}

const normalize = (d?: Date) =>
  d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined;

export function DatePickerField({
  label,
  date,
  onSelect,
  placeholder = "Seleccionar fecha",
  required,
  error,
  disabled,
  captionLayout,
  startMonth,
  endMonth,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [localDate, setLocalDate] = useState<Date | undefined>(date);
  const fieldId = useId();
  const noteId = `${fieldId}-note`;

  // React-blessed pattern: sync local state con la prop cuando abre el modal.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setLocalDate(date);
  }

  // GUI-FE-07: fecha calendario → formatear por componentes locales
  // (toZonedTime corría el día fuera de TZ Monterrey).
  const liveLabel = localDate ? formatMtyCalendarDate(localDate) : "Selecciona una fecha";

  const handleApply = () => {
    onSelect(normalize(localDate));
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>
        {label}
        {required && <RequiredMark />}
      </Label>
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            {/* Captura rápida con teclado numérico (DD/MM/AAAA). */}
            <MaskedDateInput
              id={fieldId}
              value={date}
              onChange={(d) => onSelect(normalize(d))}
              today={nowMty()}
              placeholder={placeholder === "Seleccionar fecha" ? undefined : placeholder}
              aria-describedby={noteId}
              className="w-full"
            />
          </div>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={SHORTCUTS_HINT}
              aria-label={`Abrir calendario de ${label.replace(/\s*\*\s*$/, "")}`}
              className={cn("shrink-0", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </div>

        <DialogContent className="max-w-fit p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">{label.replace(/\s*\*\s*$/, "")}</DialogTitle>
            <p className="text-sm text-muted-foreground font-mono mt-1">{liveLabel}</p>
          </DialogHeader>
          <div className="p-3">
            <Calendar
              mode="single"
              selected={localDate}
              onSelect={(d) => setLocalDate(normalize(d))}
              disabled={disabled}
              captionLayout={captionLayout}
              startMonth={startMonth}
              endMonth={endMonth}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- El calendario vive dentro de un Dialog modal; auto-focus dirige al teclado al control principal al abrir.
              autoFocus
              className="pointer-events-auto"
            />
          </div>
          <DialogFooter className="px-5 py-3 border-t flex-row justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLocalDate(undefined)}
              disabled={!localDate}
            >
              Limpiar
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleApply} disabled={!localDate}>
                Aplicar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DateHintNote date={date} id={noteId} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
