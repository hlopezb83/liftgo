import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateDisplay, parseDateLocal } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";
import { useCreateBookingExtension } from "../../hooks/useBookingExtensions";

interface ExtendBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentEndDate: string;
}

export function ExtendBookingDialog({ open, onOpenChange, bookingId, currentEndDate }: ExtendBookingDialogProps) {
  const [newEndDate, setNewEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const createExtension = useCreateBookingExtension();


  const currentEndDateObj = (() => {
    try {
      return parseDateLocal(currentEndDate);
    } catch {
      return undefined;
    }
  })();

  const handleSubmit = () => {
    const ymd = toYMD(newEndDate);
    if (!ymd) return;
    createExtension.mutate(
      { booking_id: bookingId, original_end_date: currentEndDate, new_end_date: ymd, reason: reason || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setNewEndDate(undefined);
          setReason("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extender Renta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fecha de fin actual</Label>
            <Input value={formatDateDisplay(currentEndDate)} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Nueva fecha de fin *</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newEndDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newEndDate ? format(newEndDate, "dd/MM/yyyy", { locale: es }) : <span>Selecciona una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newEndDate}
                  onSelect={(d) => { setNewEndDate(d); setCalendarOpen(false); }}
                  locale={es}
                  weekStartsOn={1}
                  disabled={(date) => (currentEndDateObj ? date <= currentEndDateObj : false)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea placeholder="Ej: Cliente solicitó extensión por 2 semanas más..." value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!newEndDate || createExtension.isPending}>
            {createExtension.isPending ? "Extendiendo..." : "Confirmar Extensión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
