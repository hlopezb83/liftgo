import { useState } from "react";
import { useForklifts, useMaintenanceLogs, useCreateMaintenanceLog } from "@/hooks/useForkliftData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Wrench, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const SERVICE_TYPES = ["Routine Inspection", "Oil Change", "Battery Service", "Tire Replacement", "Hydraulic Repair", "Brake Service", "Electrical Repair", "Other"];

export default function MaintenancePage() {
  const { data: forklifts } = useForklifts();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const createLog = useCreateMaintenanceLog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [forkliftId, setForkliftId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [performedAt, setPerformedAt] = useState<Date>(new Date());
  const [nextServiceDate, setNextServiceDate] = useState<Date>();

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const resetForm = () => {
    setForkliftId(""); setServiceType(""); setDescription(""); setCost(""); setPerformedBy(""); setPerformedAt(new Date()); setNextServiceDate(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkliftId || !serviceType) { toast.error("Forklift and service type are required"); return; }

    createLog.mutate(
      {
        forklift_id: forkliftId,
        service_type: serviceType,
        description: description || null,
        cost: cost ? parseFloat(cost) : 0,
        performed_by: performedBy || null,
        performed_at: format(performedAt, "yyyy-MM-dd"),
        next_service_date: nextServiceDate ? format(nextServiceDate, "yyyy-MM-dd") : null,
      },
      {
        onSuccess: () => { toast.success("Maintenance log added"); setDialogOpen(false); resetForm(); },
      }
    );
  };

  const totalCost = logs?.reduce((sum, l: any) => sum + (l.cost || 0), 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-muted-foreground text-sm">{logs?.length || 0} service records — ${totalCost.toLocaleString()} total cost</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm">
          <PlusCircle className="h-4 w-4 mr-1" /> Log Service
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Forklift</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Next Service</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{log.performed_at}</TableCell>
                    <TableCell className="font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</TableCell>
                    <TableCell>{log.service_type}</TableCell>
                    <TableCell>{log.performed_by || "—"}</TableCell>
                    <TableCell className="text-right font-medium">${log.cost || 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.next_service_date || "—"}</TableCell>
                  </TableRow>
                ))}
                {(!logs || logs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">No maintenance records yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Log Maintenance</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Forklift *</Label>
              <Select value={forkliftId} onValueChange={setForkliftId}>
                <SelectTrigger><SelectValue placeholder="Select forklift" /></SelectTrigger>
                <SelectContent>
                  {forklifts?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service Type *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details about the service..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Cost ($)</Label>
                <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Performed By</Label>
                <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Technician name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Service Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(performedAt, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={performedAt} onSelect={(d) => d && setPerformedAt(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Next Service Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !nextServiceDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {nextServiceDate ? format(nextServiceDate, "PPP") : "Optional"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={nextServiceDate} onSelect={setNextServiceDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={createLog.isPending}>Add Log</Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
