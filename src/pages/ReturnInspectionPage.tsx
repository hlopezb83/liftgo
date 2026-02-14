import { useState } from "react";
import { useBookings, useForklifts } from "@/hooks/useForkliftData";
import { useCreateReturnInspection, useReturnInspections } from "@/hooks/useReturnInspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { formatCurrency } from "@/lib/formatCurrency";
import { PlusCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"];

const initialForm = {
  bookingId: "" as string,
  condition: "good" as string,
  damageNotes: "" as string,
  damageCost: "" as string,
  hoursUsed: "" as string,
  fuelLevel: "" as string,
  inspectedBy: "" as string,
};

export default function ReturnInspectionPage() {
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: inspections, isLoading } = useReturnInspections();
  const createInspection = useCreateReturnInspection();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);

  const activeBookings = bookings?.filter(
    (b) => b.status === "confirmed" && !b.return_status
  );

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bookingId) { toast.error("Select a booking to return"); return; }
    const booking = bookings?.find((b) => b.id === form.bookingId);
    if (!booking) return;

    createInspection.mutate(
      {
        booking_id: form.bookingId,
        forklift_id: booking.forklift_id,
        condition: form.condition,
        damage_notes: form.damageNotes || null,
        damage_cost: form.damageCost ? parseFloat(form.damageCost) : 0,
        hours_used: form.hoursUsed ? parseFloat(form.hoursUsed) : null,
        fuel_level: form.fuelLevel || null,
        inspected_by: form.inspectedBy || null,
      },
      {
        onSuccess: () => {
          toast.success("Return inspection recorded — forklift marked available");
          setDialogOpen(false);
          reset();
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Returns & Check-in"
        subtitle="Inspect returned equipment and update fleet status"
        action={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> New Return
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
                  <TableHead>Forklift</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Damage Cost</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections && inspections.length > 0 ? inspections.map((ins) => (
                  <TableRow key={ins.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(ins.inspected_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{(ins as any).forklifts?.name || "—"}</TableCell>
                    <TableCell>{(ins as any).bookings?.customer_name || "—"}</TableCell>
                    <TableCell><StatusBadge status={ins.condition} /></TableCell>
                    <TableCell className="font-mono">{ins.damage_cost ? formatCurrency(ins.damage_cost) : "—"}</TableCell>
                    <TableCell>{ins.inspected_by || "—"}</TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={6} message="No return inspections yet" />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Return Inspection
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Booking to Return *</Label>
              <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Select active booking" /></SelectTrigger>
                <SelectContent>
                  {activeBookings?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Unknown"} ({b.start_date} → {b.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Condition *</Label>
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Damage Notes</Label>
              <Textarea value={form.damageNotes} onChange={(e) => set("damageNotes", e.target.value)} placeholder="Describe any damage..." rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Damage Cost (€)</Label>
                <Input type="number" step="0.01" value={form.damageCost} onChange={(e) => set("damageCost", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Hours Used</Label>
                <Input type="number" step="0.1" value={form.hoursUsed} onChange={(e) => set("hoursUsed", e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fuel Level</Label>
                <Select value={form.fuelLevel} onValueChange={(v) => set("fuelLevel", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["Full", "3/4", "1/2", "1/4", "Empty"].map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Inspected By</Label>
                <Input value={form.inspectedBy} onChange={(e) => set("inspectedBy", e.target.value)} placeholder="Inspector name" />
              </div>
            </div>

            <FormActions submitLabel="Complete Return" isPending={createInspection.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
