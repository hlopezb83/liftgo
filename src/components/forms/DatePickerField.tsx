import { format } from "date-fns";
import { useEffect, useState } from "react";
import { CalendarIcon } from "@/components/icons";
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
import { cn } from "@/lib/utils";
import type { Matcher } from "react-day-picker";

interface DatePickerFieldProps {
  label: string;
  date?: Date;
  onSelect: (d?: Date) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: Matcher | Matcher[];
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
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [localDate, setLocalDate] = useState<Date | undefined>(date);

  useEffect(() => {
    if (open) setLocalDate(date);
  }, [open, date]);

  const triggerLabel = date ? format(date, "dd/MM/yyyy") : placeholder;
  const liveLabel = localDate ? format(localDate, "dd/MM/yyyy") : "Selecciona una fecha";

  const handleApply = () => {
    onSelect(normalize(localDate));
    setOpen(false);
  };

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
              !date && "text-muted-foreground",
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
              mode="single"
              selected={localDate}
              onSelect={(d) => setLocalDate(normalize(d))}
              defaultMonth={localDate ?? new Date()}
              disabled={disabled}
              initialFocus
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
