import { useParams, useNavigate } from "react-router-dom";
import { useForklift, useStatusLogs, useBookings, useUpdateStatus, useDeleteForklift, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Edit, Truck, DollarSign, History, Trash2, CalendarDays, Wrench, StickyNote } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { DocumentAttachments } from "@/components/DocumentAttachments";

export default function ForkliftDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: forklift, isLoading } = useForklift(id);
  const { data: logs } = useStatusLogs(id);
  const { data: bookings } = useBookings(id);
  const { data: maintenanceLogs } = useMaintenanceLogs(id);
  const updateStatus = useUpdateStatus();
  const deleteForklift = useDeleteForklift();
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-96" /></div>;
  }

  if (!forklift) {
    return <div className="p-6 text-muted-foreground">Forklift not found</div>;
  }

  const handleStatusChange = () => {
    if (!newStatus || newStatus === forklift.status) return;
    updateStatus.mutate(
      { forkliftId: forklift.id, fromStatus: forklift.status, toStatus: newStatus, note: statusNote || undefined },
      {
        onSuccess: () => {
          toast.success("Status updated");
          setNewStatus("");
          setStatusNote("");
        },
      }
    );
  };

  const handleDelete = () => {
    navigate("/fleet");
    toast.success("Forklift deleted");
    deleteForklift.mutate(forklift.id, {
      onError: () => toast.error("Delete failed — the forklift may still exist"),
    });
  };

  const specs = [
    { label: "Model", value: forklift.model },
    { label: "Manufacturer", value: forklift.manufacturer },
    { label: "Year", value: forklift.year },
    { label: "Capacity", value: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : null },
    { label: "Mast Height", value: forklift.mast_height_m ? `${forklift.mast_height_m} m` : null },
    { label: "Fuel Type", value: forklift.fuel_type },
    { label: "Serial No.", value: forklift.serial_number },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fleet")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{forklift.name}</h1>
            <StatusBadge status={forklift.status} />
          </div>
          <p className="text-sm text-muted-foreground">{forklift.model} — {forklift.manufacturer}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/fleet/${id}/edit`)}>
          <Edit className="h-4 w-4 mr-1" /> Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {forklift.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this forklift and all its related bookings, maintenance logs, and status history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Specs */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {specs.map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="font-medium text-sm">{s.value || "—"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Rental Rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Daily</span><span className="font-semibold">${forklift.daily_rate || 0}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Weekly</span><span className="font-semibold">${forklift.weekly_rate || 0}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Monthly</span><span className="font-semibold">${forklift.monthly_rate || 0}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {forklift.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><StickyNote className="h-4 w-4" /> Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{forklift.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Status change */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Change Status</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 items-end flex-wrap">
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select new status" />
            </SelectTrigger>
            <SelectContent>
              {["available", "rented", "maintenance", "retired"].filter((s) => s !== forklift.status).map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Reason for change (optional)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            className="w-[280px]"
          />
          <Button onClick={handleStatusChange} disabled={!newStatus || updateStatus.isPending} size="sm">
            Update Status
          </Button>
        </CardContent>
      </Card>

      {/* Bookings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{b.customer_name || "Unknown"}</span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(b.start_date), "MMM d")} – {format(new Date(b.end_date), "MMM d, yyyy")}
                    </span>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bookings yet</p>
          )}
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Maintenance History</CardTitle>
        </CardHeader>
        <CardContent>
          {maintenanceLogs && maintenanceLogs.length > 0 ? (
            <div className="space-y-2">
              {maintenanceLogs.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{m.service_type}</span>
                    {m.performed_by && <span className="text-muted-foreground ml-2">by {m.performed_by}</span>}
                    {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">{format(new Date(m.performed_at), "MMM d, yyyy")}</span>
                    {m.cost ? <p className="text-xs font-medium">${m.cost}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No maintenance records</p>
          )}
        </CardContent>
      </Card>

      {/* Document attachments */}
      {id && <DocumentAttachments entityType="forklift" entityId={id} />}

      {/* Status history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium">{log.from_status || "—"}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="font-medium">{log.to_status}</span>
                    {log.note && <span className="text-muted-foreground ml-2">— {log.note}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(log.changed_at), "MMM d, yyyy HH:mm")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No history yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
