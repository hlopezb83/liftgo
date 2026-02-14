import { useNavigate } from "react-router-dom";
import { useForklifts, useCustomers, useCreateBooking, useBookings, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format, parseISO, areIntervalsOverlapping, isPast, differenceInDays } from "date-fns";

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
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [recurringBilling, setRecurringBilling] = useState(false);

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatePickerField label="Start Date" date={startDate} onSelect={setStartDate} required />
              <DatePickerField label="End Date" date={endDate} onSelect={setEndDate} required />
            </div>

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

        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {customers && customers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Select Existing Customer</Label>
                <Select value={customerId} onValueChange={(v) => {
                  setCustomerId(v);
                  const c = customers.find((c) => c.id === v);
                  if (c) { setCustomerName(c.name); setCustomerContact(c.email || ""); }
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose a customer (optional)" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input placeholder="Company or person name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input placeholder="Email or phone" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <FormActions submitLabel="Create Booking" isPending={createBooking.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
