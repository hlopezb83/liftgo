import { useNavigate } from "react-router-dom";
import { useForklifts, useCustomers, useCreateBooking, useBookings, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format, parseISO, areIntervalsOverlapping, isPast, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";

export default function BookingForm() {
  const navigate = useNavigate();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const createBooking = useCreateBooking();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [recurringBilling, setRecurringBilling] = useState(false);

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  // Check for booking conflicts
  const conflict = useMemo(() => {
    if (!forkliftId || !startDate || !endDate || !allBookings) return null;
    return allBookings.find(
      (b) =>
        b.forklift_id === forkliftId &&
        b.status !== "completed" &&
        areIntervalsOverlapping(
          { start: startDate, end: endDate },
          { start: parseISO(b.start_date), end: parseISO(b.end_date) }
        )
    );
  }, [forkliftId, startDate, endDate, allBookings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkliftId || !startDate || !endDate) { toast.error("Forklift, start date, and end date are required"); return; }
    if (endDate < startDate) { toast.error("End date must be after start date"); return; }
    if (conflict) { toast.error("This forklift is already booked for the selected dates"); return; }

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
      { onSuccess: () => { toast.success("Booking created"); navigate("/calendar"); } }
    );
  };

  // Forklifts due for maintenance (block from booking)
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

  const availableForklifts = forklifts?.filter((f) => f.status === "available" && !maintenanceDueIds.has(f.id));
  const blockedForklifts = forklifts?.filter((f) => f.status === "available" && maintenanceDueIds.has(f.id));

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
            <div className="space-y-1.5">
              <Label>Forklift *</Label>
              <Select value={forkliftId} onValueChange={setForkliftId}>
                <SelectTrigger><SelectValue placeholder="Select a forklift" /></SelectTrigger>
                <SelectContent>
                  {availableForklifts?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} — {f.model} ({f.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DateRangePickerField label="Booking Dates" dateRange={dateRange} onSelect={setDateRange} required />

            {conflict && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Conflict: This forklift is booked from {conflict.start_date} to {conflict.end_date} for {conflict.customer_name || "another customer"}.</span>
              </div>
            )}

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
    </div>
  );
}
