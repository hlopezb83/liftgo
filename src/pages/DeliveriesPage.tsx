import { useState } from "react";
import { useForklifts, useBookings } from "@/hooks/useForkliftData";
import { useDeliveries, useCreateDelivery, useUpdateDelivery } from "@/hooks/useDeliveries";
import type { BookingWithForklift } from "@/hooks/useBookings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { PlusCircle, TruckIcon, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const initialForm = {
  forkliftId: "" as string,
  bookingId: "" as string,
  type: "delivery" as string,
  scheduledDate: new Date() as Date,
  scheduledTime: "" as string,
  address: "" as string,
  driverName: "" as string,
  driverPhone: "" as string,
  notes: "" as string,
};

export default function DeliveriesPage() {
  const { data: forklifts } = useForklifts();
  const { data: bookings } = useBookings();
  const { data: deliveries, isLoading } = useDeliveries();
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.scheduledDate) { toast.error("Forklift and date are required"); return; }
    createDelivery.mutate(
      {
        forklift_id: form.forkliftId,
        booking_id: form.bookingId || null,
        type: form.type,
        scheduled_date: format(form.scheduledDate, "yyyy-MM-dd"),
        scheduled_time: form.scheduledTime || null,
        address: form.address || null,
        driver_name: form.driverName || null,
        driver_phone: form.driverPhone || null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          toast.success("Delivery scheduled");
          setDialogOpen(false);
          reset();
        },
      }
    );
  };

  const markComplete = (id: string) => {
    updateDelivery.mutate(
      { id, status: "completed", completed_at: new Date().toISOString() },
      { onSuccess: () => toast.success("Marked complete") }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Deliveries & Pickups"
        subtitle="Schedule and track equipment transport"
        action={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Schedule
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Forklift</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries && deliveries.length > 0 ? deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.scheduled_date}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</TableCell>
                    <TableCell className="capitalize">{d.type}</TableCell>
                    <TableCell className="font-medium">{(d as any).forklifts?.name || forkliftMap.get(d.forklift_id)?.name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.address || "—"}</TableCell>
                    <TableCell>{d.driver_name || "—"}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      {d.status !== "completed" && (
                        <Button variant="ghost" size="icon" onClick={() => markComplete(d.id)} title="Mark complete">
                          <CheckCircle className="h-4 w-4 text-status-available" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={7} message="No deliveries scheduled" />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TruckIcon className="h-4 w-4" /> Schedule Transport</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Forklift *</Label>
                <Select value={form.forkliftId} onValueChange={(v) => set("forkliftId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {forklifts?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Linked Booking</Label>
              <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {bookings?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.customer_name || "Unknown"} ({b.start_date} → {b.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DatePickerField label="Date *" date={form.scheduledDate} onSelect={(d) => d && set("scheduledDate", d)} />
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={form.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Construction Site Rd" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Driver Name</Label>
                <Input value={form.driverName} onChange={(e) => set("driverName", e.target.value)} placeholder="John Driver" />
              </div>
              <div className="space-y-1.5">
                <Label>Driver Phone</Label>
                <Input value={form.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} placeholder="+1 555 0123" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Special instructions..." rows={2} />
            </div>

            <FormActions submitLabel="Schedule" isPending={createDelivery.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
