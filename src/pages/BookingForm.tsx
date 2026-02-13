import { useNavigate } from "react-router-dom";
import { useForklifts } from "@/hooks/useForkliftData";
import { useCustomers, useCreateBooking } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
    if (!forkliftId || !startDate || !endDate) {
      toast.error("Forklift, start date, and end date are required");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be after start date");
      return;
    }

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
      {
        onSuccess: () => {
          toast.success("Booking created");
          navigate("/calendar");
        },
      }
    );
  };

  const availableForklifts = forklifts?.filter((f) => f.status === "available" || f.status === "rented");

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
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
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
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

        <div className="flex gap-3">
          <Button type="submit" disabled={createBooking.isPending}>Create Booking</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
