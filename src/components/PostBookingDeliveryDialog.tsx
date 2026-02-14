import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDelivery } from "@/hooks/useDeliveries";
import { Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface PostBookingDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  customerAddress: string | null;
  onSkip: () => void;
}

export function PostBookingDeliveryDialog({
  open, onOpenChange, bookingId, forkliftId, forkliftName, startDate, customerAddress, onSkip,
}: PostBookingDeliveryDialogProps) {
  const navigate = useNavigate();
  const createDelivery = useCreateDelivery();
  const [showForm, setShowForm] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [address, setAddress] = useState(customerAddress || "");
  const [notes, setNotes] = useState("");

  const handleSchedule = () => {
    createDelivery.mutate(
      {
        forklift_id: forkliftId,
        booking_id: bookingId,
        scheduled_date: startDate,
        scheduled_time: scheduledTime || null,
        address: address || null,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        notes: notes || null,
        type: "delivery",
      },
      {
        onSuccess: () => {
          toast.success("Booking created & delivery scheduled");
          onOpenChange(false);
          navigate("/calendar");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Booking Created
          </DialogTitle>
          <DialogDescription>
            Would you like to schedule the delivery for {forkliftName}?
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setShowForm(true)}>
              <Truck className="h-4 w-4 mr-2" /> Schedule Delivery
            </Button>
            <Button variant="outline" className="w-full" onClick={onSkip}>
              Skip for Now
            </Button>
          </DialogFooter>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Date</p><p className="font-medium">{startDate}</p></div>
              <div><p className="text-muted-foreground">Type</p><p className="font-medium">Delivery</p></div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Delivery Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter delivery address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Driver Name</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label>Driver Phone</Label><Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Optional" /></div>
              </div>
              <div className="space-y-1.5"><Label>Scheduled Time</Label><Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional delivery notes" rows={2} /></div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onSkip}>Skip</Button>
              <Button onClick={handleSchedule} disabled={createDelivery.isPending}>
                {createDelivery.isPending ? "Scheduling..." : "Schedule Delivery"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
