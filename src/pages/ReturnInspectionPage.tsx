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
import { PlusCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"];

export default function ReturnInspectionPage() {
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: inspections, isLoading } = useReturnInspections();
  const createInspection = useCreateReturnInspection();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [bookingId, setBookingId] = useState("");
  const [condition, setCondition] = useState("good");
  const [damageNotes, setDamageNotes] = useState("");
  const [damageCost, setDamageCost] = useState("");
  const [hoursUsed, setHoursUsed] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");

  // Only show active/confirmed bookings for returns (not already returned)
  const activeBookings = bookings?.filter(
    (b: any) => b.status === "confirmed" && !b.return_status
  );

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const resetForm = () => {
    setBookingId(""); setCondition("good"); setDamageNotes(""); setDamageCost("");
    setHoursUsed(""); setFuelLevel(""); setInspectedBy("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId) { toast.error("Select a booking to return"); return; }
    const booking = bookings?.find((b: any) => b.id === bookingId);
    if (!booking) return;

    createInspection.mutate(
      {
        booking_id: bookingId,
        forklift_id: booking.forklift_id,
        condition,
        damage_notes: damageNotes || null,
        damage_cost: damageCost ? parseFloat(damageCost) : 0,
        hours_used: hoursUsed ? parseFloat(hoursUsed) : null,
        fuel_level: fuelLevel || null,
        inspected_by: inspectedBy || null,
      },
      {
        onSuccess: () => {
          toast.success("Return inspection recorded — forklift marked available");
          setDialogOpen(false);
          resetForm();
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
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm">
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
                {inspections && inspections.length > 0 ? inspections.map((ins: any) => (
                  <TableRow key={ins.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(ins.inspected_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{ins.forklifts?.name || "—"}</TableCell>
                    <TableCell>{ins.bookings?.customer_name || "—"}</TableCell>
                    <TableCell><StatusBadge status={ins.condition} /></TableCell>
                    <TableCell className="font-mono">{ins.damage_cost ? `€${ins.damage_cost}` : "—"}</TableCell>
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
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger><SelectValue placeholder="Select active booking" /></SelectTrigger>
                <SelectContent>
                  {activeBookings?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Unknown"} ({b.start_date} → {b.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Condition *</Label>
              <Select value={condition} onValueChange={setCondition}>
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
              <Textarea value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="Describe any damage..." rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Damage Cost (€)</Label>
                <Input type="number" step="0.01" value={damageCost} onChange={(e) => setDamageCost(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Hours Used</Label>
                <Input type="number" step="0.1" value={hoursUsed} onChange={(e) => setHoursUsed(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fuel Level</Label>
                <Select value={fuelLevel} onValueChange={setFuelLevel}>
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
                <Input value={inspectedBy} onChange={(e) => setInspectedBy(e.target.value)} placeholder="Inspector name" />
              </div>
            </div>

            <FormActions submitLabel="Complete Return" isPending={createInspection.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
