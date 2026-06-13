import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  label: string;
  date?: Date;
  onSelect: (d?: Date) => void;
  placeholder?: string;
  required?: boolean;
}

const normalize = (d?: Date) =>
  d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined;

export function DatePickerField({ label, date, onSelect, placeholder = "Seleccionar fecha", required }: DatePickerFieldProps) {
  const handleSelect = (d?: Date) => onSelect(normalize(d));

  return (
    <div className="space-y-1.5">
      <Label>{label}{required && " *"}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "dd/MM/yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleSelect} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

