import { useNavigate } from "react-router-dom";
import { useCustomers, useCreateBooking, useAvailableForklifts } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { ForkliftSelector } from "@/components/ForkliftSelector";
import { PostBookingDeliveryDialog } from "@/components/PostBookingDeliveryDialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress: string | null;
}

export default function BookingForm() {
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const createBooking = useCreateBooking();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [recurringBilling, setRecurringBilling] = useState(false);
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);

  const { availableForklifts, forklifts, datesSelected } = useAvailableForklifts(dateRange);
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

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
        },
      }
    );
  };

  const handleSkipDelivery = () => {
    setPostBooking(null);
    toast.success("Booking created");
    navigate("/calendar");
  };

  const selectedForklift = forklifts?.find((f) => f.id === postBooking?.forkliftId);

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title="New Booking" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Booking Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField label="Booking Dates *" dateRange={dateRange} onSelect={setDateRange} required />

            <ForkliftSelector
              value={forkliftId}
              onValueChange={setForkliftId}
              availableForklifts={availableForklifts}
              datesSelected={datesSelected}
              showStatus
            />

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

      {postBooking && (
        <PostBookingDeliveryDialog
          open={!!postBooking}
          onOpenChange={(open) => { if (!open) handleSkipDelivery(); }}
          bookingId={postBooking.bookingId}
          forkliftId={postBooking.forkliftId}
          forkliftName={selectedForklift?.name || ""}
          startDate={postBooking.startDate}
          customerAddress={postBooking.customerAddress}
          onSkip={handleSkipDelivery}
        />
      )}
    </div>
  );
}
