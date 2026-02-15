import { useNavigate } from "react-router-dom";
import { useForklifts, useCustomers, useCreateBooking, useBookings, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { useCreateDelivery } from "@/hooks/useDeliveries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft, Truck, CheckCircle2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { format, parseISO, areIntervalsOverlapping, isPast, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress: string | null;
}

export default function BookingForm() {
  const navigate = useNavigate();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const createBooking = useCreateBooking();
  const createDelivery = useCreateDelivery();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [recurringBilling, setRecurringBilling] = useState(false);

  // Post-booking delivery dialog state
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  // Forklifts due for maintenance
  const maintenanceDueIds = useMemo(() => {
    if (!maintenanceLogs) return new Set<string>();
    const ids = new Set<string>();
    const seen = new Set<string>();
    maintenanceLogs.forEach((log) => {
      if (!seen.has(log.forklift_id)) {
        seen.add(log.forklift_id);
        if (log.next_service_date && (isPast(parseISO(log.next_service_date)) || differenceInDays(parseISO(log.next_service_date), new Date()) <= 3)) {
          ids.add(log.forklift_id);
        }
      }
    });
    return ids;
  }, [maintenanceLogs]);

  // Filter forklifts: available status, not maintenance-due, no overlapping bookings
  const availableForklifts = useMemo(() => {
    if (!forklifts || !datesSelected) return [];
    return forklifts.filter((f) => {
      if (f.status !== "available" || maintenanceDueIds.has(f.id)) return false;
      // Check for overlapping confirmed bookings
      const hasOverlap = allBookings?.some(
        (b) =>
          b.forklift_id === f.id &&
          b.status !== "completed" &&
          areIntervalsOverlapping(
            { start: startDate!, end: endDate! },
            { start: parseISO(b.start_date), end: parseISO(b.end_date) }
          )
      );
      return !hasOverlap;
    });
  }, [forklifts, datesSelected, startDate, endDate, allBookings, maintenanceDueIds]);

  // Reset forklift selection when dates change and it's no longer available
  useEffect(() => {
    if (forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      setForkliftId("");
    }
  }, [availableForklifts, forkliftId, datesSelected]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkliftId || !startDate || !endDate) { toast.error("Forklift, start date, and end date are required"); return; }
    if (endDate < startDate) { toast.error("End date must be after start date"); return; }

    const selectedCustomer = customers?.find((c) => c.id === customerId);
    createBooking.mutate(
      {
        forklift_id: forkliftId,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        customer_name: selectedCustomer?.name || customerName || null,
        customer_contact: selectedCustomer?.email || customerContact || null,
        customer_id: customerId || null,
        status: "confirmed",
        recurring_billing: recurringBilling,
      },
      {
        onSuccess: (bookingId: string) => {
          const cust = customers?.find((c) => c.id === customerId);
          setPostBooking({
            bookingId,
            forkliftId,
            startDate: format(startDate!, "yyyy-MM-dd"),
            customerAddress: cust?.address || null,
          });
          setDeliveryAddress(cust?.address || "");
        },
      }
    );
  };

  const handleScheduleDelivery = () => {
    if (!postBooking) return;
    createDelivery.mutate(
      {
        forklift_id: postBooking.forkliftId,
        booking_id: postBooking.bookingId,
        scheduled_date: postBooking.startDate,
        scheduled_time: scheduledTime || null,
        address: deliveryAddress || null,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        notes: deliveryNotes || null,
        type: "delivery",
      },
      {
        onSuccess: () => {
          toast.success("Booking created & delivery scheduled");
          navigate("/calendar");
        },
      }
    );
  };

  const handleSkipDelivery = () => {
    toast.success("Booking created");
    navigate("/calendar");
  };

  const selectedForkliftName = forklifts?.find((f) => f.id === postBooking?.forkliftId);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold">New Booking</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Booking Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField label="Booking Dates *" dateRange={dateRange} onSelect={setDateRange} required />

            <div className="space-y-1.5">
              <Label>Forklift *</Label>
              <Select value={forkliftId} onValueChange={setForkliftId} disabled={!datesSelected}>
                <SelectTrigger>
                  <SelectValue placeholder={datesSelected ? "Select a forklift" : "Select dates first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableForklifts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} — {f.model} ({f.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datesSelected && availableForklifts.length === 0 && (
                <p className="text-xs text-muted-foreground">No forklifts available for the selected dates.</p>
              )}
            </div>

            {startDate && endDate && differenceInDays(endDate, startDate) >= 30 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div>
                  <p className="text-sm font-medium">Enable Recurring Billing</p>
                  <p className="text-xs text-muted-foreground">Auto-generate monthly invoices for this long-term booking</p>
                </div>
                <Switch checked={recurringBilling} onCheckedChange={setRecurringBilling} />
              </div>
            )}
          </CardContent>
        </Card>

        <CustomerSelector
          customers={customers}
          customerId={customerId}
          customerName={customerName}
          onCustomerIdChange={setCustomerId}
          onCustomerNameChange={setCustomerName}
          customerContact={customerContact}
          onCustomerContactChange={setCustomerContact}
        />

        <FormActions submitLabel="Create Booking" isPending={createBooking.isPending} onCancel={() => navigate(-1)} />
      </form>

      {/* Post-booking delivery dialog */}
      <Dialog open={!!postBooking} onOpenChange={(open) => { if (!open) handleSkipDelivery(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Booking Created
            </DialogTitle>
            <DialogDescription>
              Would you like to schedule the delivery for {selectedForkliftName?.name}?
            </DialogDescription>
          </DialogHeader>

          {!showDeliveryForm ? (
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button className="w-full" onClick={() => setShowDeliveryForm(true)}>
                <Truck className="h-4 w-4 mr-2" />
                Schedule Delivery
              </Button>
              <Button variant="outline" className="w-full" onClick={handleSkipDelivery}>
                Skip for Now
              </Button>
            </DialogFooter>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{postBooking?.startDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">Delivery</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Delivery Address</Label>
                  <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Enter delivery address" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Driver Name</Label>
                    <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Driver Phone</Label>
                    <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Scheduled Time</Label>
                  <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="Optional delivery notes" rows={2} />
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={handleSkipDelivery}>Skip</Button>
                <Button onClick={handleScheduleDelivery} disabled={createDelivery.isPending}>
                  {createDelivery.isPending ? "Scheduling..." : "Schedule Delivery"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
