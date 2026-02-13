import { useNavigate } from "react-router-dom";
import { useForklifts, useCustomers, useCreateBooking } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function BookingForm() {
  const navigate = useNavigate();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const createBooking = useCreateBooking();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

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
      },
      { onSuccess: () => { toast.success("Booking created"); navigate("/calendar"); } }
    );
  };

  const availableForklifts = forklifts?.filter((f) => f.status === "available" || f.status === "rented");

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
