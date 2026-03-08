import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

interface DateRangePickerFieldProps {
  label: string;
  dateRange?: DateRange;
  onSelect: (range?: DateRange) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}

export function DateRangePickerField({ label, dateRange, onSelect, placeholder = "Seleccionar fechas", required, error }: DateRangePickerFieldProps) {
  const [open, setOpen] = useState(false);
  // Local state to avoid re-rendering the trigger while calendar is open
  const [localRange, setLocalRange] = useState<DateRange | undefined>(dateRange);
  const pendingRange = useRef<DateRange | undefined>(dateRange);

  // Sync external changes when popover is closed
  useEffect(() => {
    if (!open) {
      setLocalRange(dateRange);
      pendingRange.current = dateRange;
    }
  }, [dateRange, open]);

  const handleSelect = (range?: DateRange) => {
    setLocalRange(range);
    pendingRange.current = range;
    // When both dates selected, close and propagate
    if (range?.from && range?.to) {
      setOpen(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && pendingRange.current) {
      // Propagate selection to parent when closing
      onSelect(pendingRange.current);
    }
    setOpen(isOpen);
  };

  const formatLabel = () => {
    const dr = open ? localRange : dateRange;
    if (!dr?.from) return placeholder;
    if (!dr.to) return format(dr.from, "dd/MM/yyyy") + " — …";
    return format(dr.from, "dd/MM") + " — " + format(dr.to, "dd/MM/yyyy");
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
            selected={localRange}
            onSelect={handleSelect}
            numberOfMonths={2}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
