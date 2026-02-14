import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { formatCurrency } from "@/lib/formatCurrency";
import { useForklifts } from "@/hooks/useForkliftData";
import { useUpdateBooking, type BookingWithForklift } from "@/hooks/useBookings";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { CalendarPlus, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BookingActionsProps {
  booking: BookingWithForklift;
}

export function BookingActions({ booking }: BookingActionsProps) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [earlyReturnDate, setEarlyReturnDate] = useState<Date>();
  const { data: forklifts } = useForklifts();
  const updateBooking = useUpdateBooking();

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
      { onSuccess: () => { toast.success("Booking extended"); setExtendOpen(false); } }
    );
  };

  const handleEarlyReturn = () => {
    if (!earlyReturnDate) return;
    updateBooking.mutate(
      { id: booking.id, end_date: format(earlyReturnDate, "yyyy-MM-dd") },
      { onSuccess: () => { toast.success("Booking end date updated for early return"); setReturnOpen(false); } }
    );
  };

  const handleCancel = () => {
    updateBooking.mutate(
      { id: booking.id, status: "cancelled" },
      { onSuccess: () => toast.success("Booking cancelled") }
    );
  };

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => { setNewEndDate(undefined); setExtendOpen(true); }}>
        <CalendarPlus className="h-3.5 w-3.5 mr-1" />Extend
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setEarlyReturnDate(undefined); setReturnOpen(true); }}>
        <Undo2 className="h-3.5 w-3.5 mr-1" />Early Return
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <XCircle className="h-3.5 w-3.5 mr-1" />Cancel
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the booking for {booking.customer_name || "this customer"} ({booking.start_date} → {booking.end_date}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extend Booking</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Current end date: {booking.end_date}</p>
          <DatePickerField label="New End Date" date={newEndDate} onSelect={setNewEndDate} />
          {extendPreview && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p>New estimated total: <span className="font-bold">{formatCurrency(extendPreview.total)}</span></p>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleExtend} disabled={updateBooking.isPending}>Extend</Button>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Early Return</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Current end date: {booking.end_date}</p>
          <DatePickerField label="Return Date" date={earlyReturnDate} onSelect={setEarlyReturnDate} />
          {returnPreview && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p>Adjusted total: <span className="font-bold">{formatCurrency(returnPreview.total)}</span></p>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleEarlyReturn} disabled={updateBooking.isPending}>Confirm Early Return</Button>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
