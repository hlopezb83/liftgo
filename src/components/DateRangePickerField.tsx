import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import type { DateRange } from "react-day-picker";

interface DateRangePickerFieldProps {
  label: string;
  dateRange?: DateRange;
  onSelect: (range?: DateRange) => void;
  placeholder?: string;
  required?: boolean;
}

export function DateRangePickerField({ label, dateRange, onSelect, placeholder = "Seleccionar fechas", required }: DateRangePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const initialRangeRef = useRef<{ from?: Date; to?: Date }>({});

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      initialRangeRef.current = { from: dateRange?.from, to: dateRange?.to };
    }
    setOpen(nextOpen);
  };

  // Auto-close only when a NEW complete range is selected
  useEffect(() => {
    if (open && dateRange?.from && dateRange?.to) {
      const changed =
        dateRange.from.getTime() !== initialRangeRef.current.from?.getTime() ||
        dateRange.to.getTime() !== initialRangeRef.current.to?.getTime();
      if (changed) {
        const t = setTimeout(() => setOpen(false), 300);
        return () => clearTimeout(t);
      }
    }
  }, [open, dateRange?.from, dateRange?.to]);

  const formatLabel = () => {
    if (!dateRange?.from) return placeholder;
    if (!dateRange.to) return format(dateRange.from, "d MMM yyyy", { locale: es }) + " — …";
    return format(dateRange.from, "d MMM", { locale: es }) + " — " + format(dateRange.to, "d MMM yyyy", { locale: es });
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}{required && " *"}</Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={onSelect}
            numberOfMonths={2}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
