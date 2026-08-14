import { useState } from "react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMtyCalendarDate } from "@/lib/date/mtyCalendarDate";
import { cn, nowMty } from "@/lib/utils";
import { isPartialRange, nextRangeState, normalizeRange } from "./dateRangeState";
import type { DateRange } from "react-day-picker";

interface DateRangePickerFieldProps {
  label: string;
  dateRange?: DateRange;
  onSelect: (range?: DateRange) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
}




function formatRangeLabel(range: DateRange | undefined, empty: string, partialSuffix: string): string {
  if (!range?.from) return empty;
  // GUI-FE-07: fechas calendario por componentes locales (sin toZonedTime).
  const from = formatMtyCalendarDate(range.from);
  // R10-FE-02b: `from == to` sigue siendo selección parcial.
  if (isPartialRange(range)) return `${from} — ${partialSuffix}`;
  const to = formatMtyCalendarDate(range.to);
  return `${from} — ${to}`;
}


function DateRangeFooter({
  localRange,
  onClear,
  onCancel,
  onApply,
}: {
  localRange?: DateRange;
  onClear: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const canApply = !!localRange?.from && !!localRange?.to;
  return (
    <DialogFooter className="px-5 py-3 border-t flex-row justify-between sm:justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={!localRange?.from}>
        Limpiar
      </Button>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        {/* R10-FE-02: Aplicar explícito — cubre rangos de un día (from==to)
            que ya no se auto-aplican, y da salida clara en móvil. */}
        <Button type="button" size="sm" onClick={onApply} disabled={!canApply}>
          Aplicar
        </Button>
      </div>
    </DialogFooter>
  );
}

export function DateRangePickerField({
  label,
  dateRange,
  onSelect,
  placeholder = "Seleccionar fechas",
  required,
  error,
  helperText,
}: DateRangePickerFieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [localRange, setLocalRange] = useState<DateRange | undefined>(dateRange);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setLocalRange(dateRange);
  }

  const triggerLabel = formatRangeLabel(dateRange, placeholder, "…");
  const liveLabel = localRange?.from
    ? formatRangeLabel(localRange, "", "selecciona fin")
    : "Selecciona la fecha de inicio";

  // R9-P2: auto-aplicar en cuanto el rango queda completo.
  const applyRange = (range?: DateRange) => {
    onSelect(normalizeRange(range));
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <RequiredMark />}
      </Label>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Captura rápida con teclado (DD/MM/AAAA) para inicio y fin. */}
        <div className="flex items-start gap-2">
          <MaskedDateInput
            value={dateRange?.from}
            onChange={(d) => onSelect(normalizeRange({ from: d, to: dateRange?.to }))}
            today={nowMty()}
            aria-label={`${label} — inicio`}
            className="flex-1 min-w-0"
          />
          <span className="pt-2 text-muted-foreground">—</span>
          <MaskedDateInput
            value={dateRange?.to}
            onChange={(d) => onSelect(normalizeRange({ from: dateRange?.from, to: d }))}
            today={nowMty()}
            aria-label={`${label} — fin`}
            className="flex-1 min-w-0"
          />
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={triggerLabel}
              aria-label={`Abrir calendario de ${label.replace(/\s*\*\s*$/, "")}`}
              className={cn("shrink-0", !dateRange?.from && "text-muted-foreground")}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </div>

        <RangeDialogBody
          label={label}
          liveLabel={liveLabel}
          localRange={localRange}
          isMobile={isMobile}
          onCalendarSelect={(r) => {
            const { range, apply } = nextRangeState(localRange, r);
            setLocalRange(range);
            if (apply) applyRange(range);
          }}

          onClear={() => setLocalRange(undefined)}
          onCancel={() => setOpen(false)}
          onApply={() => applyRange(localRange)}
        />
      </Dialog>
      {error ? <p className="text-sm text-destructive">{error}</p> : helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

function RangeDialogBody({
  label,
  liveLabel,
  localRange,
  isMobile,
  onCalendarSelect,
  onClear,
  onCancel,
  onApply,
}: {
  label: string;
  liveLabel: string;
  localRange?: DateRange;
  isMobile: boolean;
  onCalendarSelect: (r?: DateRange) => void;
  onClear: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const months = isMobile ? 1 : 2;
  return (
    // El ancho se fija (no `max-w-fit`) para que el diálogo no se re-centre
    // al cambiar la etiqueta viva: el reflow provocaba clics inestables.
    <DialogContent className="w-fit min-w-[22rem] max-w-[95vw] p-0 gap-0">
      <DialogHeader className="px-5 pt-5 pb-3 border-b">
        <DialogTitle className="text-base">{label.replace(/\s*\*\s*$/, "")}</DialogTitle>
        <p className="text-sm text-muted-foreground font-mono mt-1 h-5 whitespace-nowrap overflow-hidden">
          {liveLabel}
        </p>

      </DialogHeader>
      <div className="p-3">
        <Calendar
          mode="range"
          selected={localRange}
          onSelect={onCalendarSelect}
          // R12-FE-03 (P2 r11): con un rango ya completo, el siguiente clic
          // reinicia la selección (rdp v10 fusionaba con el `from` viejo).
          resetOnSelect
          numberOfMonths={months}
          className="pointer-events-auto"
        />
      </div>
      <DateRangeFooter
        localRange={localRange}
        onClear={onClear}
        onCancel={onCancel}
        onApply={onApply}
      />
    </DialogContent>
  );
}
