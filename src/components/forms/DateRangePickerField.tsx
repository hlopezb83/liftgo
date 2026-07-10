import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface DateRangePickerFieldProps {
  label: string;
  dateRange?: DateRange;
  onSelect: (range?: DateRange) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}

const normalize = (d?: Date) =>
  d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined;

const normalizeRange = (r?: DateRange): DateRange | undefined =>
  r ? { from: normalize(r.from), to: normalize(r.to) } : undefined;

function formatRangeLabel(range: DateRange | undefined, empty: string, partialSuffix: string): string {
  if (!range?.from) return empty;
  const from = format(range.from, "dd/MM/yyyy");
  if (!range.to) return `${from} — ${partialSuffix}`;
  const to = format(range.to, "dd/MM/yyyy");
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
  const canApply = !!(localRange?.from && localRange?.to);
  return (
    <DialogFooter className="px-5 py-3 border-t flex-row justify-between sm:justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={!localRange?.from}>
        Limpiar
      </Button>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
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
}: DateRangePickerFieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [localRange, setLocalRange] = useState<DateRange | undefined>(dateRange);

  useEffect(() => {
    if (open) setLocalRange(dateRange);
  }, [open, dateRange]);

  const triggerLabel = formatRangeLabel(dateRange, placeholder, "…");
  const liveLabel = localRange?.from
    ? formatRangeLabel(localRange, "", "selecciona fin")
    : "Selecciona la fecha de inicio";

  const handleApply = () => {
    onSelect(normalizeRange(localRange));
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? " *" : null}
      </Label>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !dateRange?.from && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-fit p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">{label.replace(/\s*\*\s*$/, "")}</DialogTitle>
            <p className="text-sm text-muted-foreground font-mono mt-1">{liveLabel}</p>
          </DialogHeader>
          <div className="p-3">
            <Calendar
              mode="range"
              selected={localRange}
              onSelect={(r) => setLocalRange(normalizeRange(r))}
              numberOfMonths={isMobile ? 1 : 2}
              defaultMonth={localRange?.from ?? new Date()}
              className="pointer-events-auto"
            />
          </div>
          <DateRangeFooter
            localRange={localRange}
            onClear={() => setLocalRange(undefined)}
            onCancel={() => setOpen(false)}
            onApply={handleApply}
          />
        </DialogContent>
      </Dialog>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
