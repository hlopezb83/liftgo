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

  // Sync local state when dialog opens to reflect external value
  useEffect(() => {
    if (open) setLocalRange(dateRange);
  }, [open, dateRange]);

  const formatTrigger = () => {
    if (!dateRange?.from) return placeholder;
    if (!dateRange.to) return `${format(dateRange.from, "dd/MM/yyyy")} — …`;
    return `${format(dateRange.from, "dd/MM/yyyy")} — ${format(dateRange.to, "dd/MM/yyyy")}`;
  };

  const formatLive = () => {
    if (!localRange?.from) return "Selecciona la fecha de inicio";
    if (!localRange.to) return `${format(localRange.from, "dd/MM/yyyy")} — selecciona fin`;
    return `${format(localRange.from, "dd/MM/yyyy")} → ${format(localRange.to, "dd/MM/yyyy")}`;
  };

  const handleApply = () => {
    onSelect(normalizeRange(localRange));
    setOpen(false);
  };

  const handleClear = () => {
    setLocalRange(undefined);
  };

  const canApply = !!(localRange?.from && localRange?.to);

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && " *"}
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
            {formatTrigger()}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-fit p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">{label.replace(/\s*\*\s*$/, "")}</DialogTitle>
            <p className="text-sm text-muted-foreground font-mono mt-1">{formatLive()}</p>
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
          <DialogFooter className="px-5 py-3 border-t flex-row justify-between sm:justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={!localRange?.from}>
              Limpiar
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleApply} disabled={!canApply}>
                Aplicar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
