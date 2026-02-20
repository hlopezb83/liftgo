import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { formatCurrency } from "@/lib/formatCurrency";
import { useForklifts } from "@/hooks/useForkliftData";
import { useUpdateBooking, type BookingWithForklift } from "@/hooks/useBookings";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { CalendarPlus, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BookingActionsProps { booking: BookingWithForklift; }

export function BookingActions({ booking }: BookingActionsProps) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [earlyReturnDate, setEarlyReturnDate] = useState<Date>();
  const { data: forklifts } = useForklifts();
  const updateBooking = useUpdateBooking();
  const queryClient = useQueryClient();
  if (booking.status !== "confirmed") return null;

  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  const getPreview = (start: string, end: Date | undefined) => {
    if (!forklift || !end) return null;
    const items = generateLineItems(forklift, start, format(end, "yyyy-MM-dd"));
    return computeTotals(items, 21);
  };
  const extendPreview = getPreview(booking.start_date, newEndDate);
  const returnPreview = getPreview(booking.start_date, earlyReturnDate);

  const handleExtend = () => {
    if (!newEndDate) return;
    updateBooking.mutate(
      { id: booking.id, end_date: format(newEndDate, "yyyy-MM-dd") },
      { onSuccess: () => { toast.success("Reserva extendida"); setExtendOpen(false); } }
    );
  };

  const handleEarlyReturn = () => {
    if (!earlyReturnDate) return;
    updateBooking.mutate(
      { id: booking.id, end_date: format(earlyReturnDate, "yyyy-MM-dd") },
      { onSuccess: () => { toast.success("Fecha de devolución anticipada actualizada"); setReturnOpen(false); } }
    );
  };

  const handleCancel = async () => {
    try {
      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: booking.id });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      toast.success("Reserva cancelada");
    } catch (err: any) {
      toast.error("Error al cancelar: " + err.message);
    }
  };

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => { setNewEndDate(undefined); setExtendOpen(true); }}>
        <CalendarPlus className="h-3.5 w-3.5 mr-1" />Extender
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setEarlyReturnDate(undefined); setReturnOpen(true); }}>
        <Undo2 className="h-3.5 w-3.5 mr-1" />Devolución Anticipada
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <XCircle className="h-3.5 w-3.5 mr-1" />Cancelar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará la reserva de {booking.customer_name || "este cliente"} ({booking.start_date} → {booking.end_date}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mantener Reserva</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar Reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extender Reserva</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Fecha de fin actual: {booking.end_date}</p>
          <DatePickerField label="Nueva Fecha de Fin" date={newEndDate} onSelect={setNewEndDate} />
          {extendPreview && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p>Nuevo total estimado: <span className="font-bold">{formatCurrency(extendPreview.total)}</span></p>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleExtend} disabled={updateBooking.isPending}>Extender</Button>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Devolución Anticipada</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Fecha de fin actual: {booking.end_date}</p>
          <DatePickerField label="Fecha de Devolución" date={earlyReturnDate} onSelect={setEarlyReturnDate} />
          {returnPreview && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p>Total ajustado: <span className="font-bold">{formatCurrency(returnPreview.total)}</span></p>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleEarlyReturn} disabled={updateBooking.isPending}>Confirmar Devolución</Button>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
