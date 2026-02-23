import { useParams, useNavigate } from "react-router-dom";
import { useForklift, useUpdateStatus, useDeleteForklift, useStatusLogs } from "@/hooks/useForklifts";
import { useBookings } from "@/hooks/useBookings";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
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
import { es } from "date-fns/locale";
import { DocumentAttachments } from "@/components/DocumentAttachments";
import { formatCurrency } from "@/lib/formatCurrency";
import { FORKLIFT_STATUSES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";

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
    return <div className="p-6 text-muted-foreground">Montacargas no encontrado</div>;
  }

  const handleStatusChange = () => {
    if (!newStatus || newStatus === forklift.status) return;
    updateStatus.mutate(
      { forkliftId: forklift.id, fromStatus: forklift.status, toStatus: newStatus, note: statusNote || undefined },
      {
        onSuccess: () => {
          toast.success("Estado actualizado");
          setNewStatus("");
          setStatusNote("");
        },
      }
    );
  };

  const handleDelete = () => {
    deleteForklift.mutate(forklift.id, {
      onSuccess: () => {
        toast.success("Montacargas eliminado");
        navigate("/fleet");
      },
      onError: () => toast.error("Error al eliminar"),
    });
  };

  const specs = [
    { label: "Modelo", value: forklift.model },
    { label: "Fabricante", value: forklift.manufacturer },
    { label: "Año", value: forklift.year },
    { label: "Capacidad", value: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : null },
    { label: "Altura del Mástil", value: forklift.mast_height_m ? `${forklift.mast_height_m} m` : null },
    { label: "Tipo de Combustible", value: forklift.fuel_type ? (FUEL_TYPE_LABELS[forklift.fuel_type] || forklift.fuel_type) : null },
    { label: "No. de Serie", value: forklift.serial_number },
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
          <Edit className="h-4 w-4 mr-1" /> Editar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {forklift.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esto eliminará permanentemente este montacargas y todos sus registros relacionados de reservas, mantenimiento e historial de estado. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Especificaciones</CardTitle>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Tarifas de Renta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Diaria</span><span className="font-semibold">{formatCurrency(forklift.daily_rate || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Semanal</span><span className="font-semibold">{formatCurrency(forklift.weekly_rate || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Mensual</span><span className="font-semibold">{formatCurrency(forklift.monthly_rate || 0)}</span></div>
          </CardContent>
        </Card>
      </div>

      {forklift.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><StickyNote className="h-4 w-4" /> Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{forklift.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cambiar Estado</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 items-end flex-wrap">
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar nuevo estado" />
            </SelectTrigger>
            <SelectContent>
              {FORKLIFT_STATUSES.filter((s) => s !== forklift.status).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Razón del cambio (opcional)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            className="w-[280px]"
          />
          <Button onClick={handleStatusChange} disabled={!newStatus || updateStatus.isPending} size="sm">
            Actualizar Estado
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Reservas</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{b.customer_name || "Desconocido"}</span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(b.start_date), "d MMM", { locale: es })} – {format(new Date(b.end_date), "d MMM yyyy", { locale: es })}
                    </span>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin reservas aún</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Historial de Mantenimiento</CardTitle>
        </CardHeader>
        <CardContent>
          {maintenanceLogs && maintenanceLogs.length > 0 ? (
            <div className="space-y-2">
              {maintenanceLogs.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{m.service_type}</span>
                    {m.performed_by && <span className="text-muted-foreground ml-2">por {m.performed_by}</span>}
                    {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">{format(new Date(m.performed_at), "d MMM yyyy", { locale: es })}</span>
                    {m.cost ? <p className="text-xs font-medium">{formatCurrency(m.cost)}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin registros de mantenimiento</p>
          )}
        </CardContent>
      </Card>

      {id && <DocumentAttachments entityType="forklift" entityId={id} />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Historial de Estado</CardTitle>
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
                  <span className="text-xs text-muted-foreground">{format(new Date(log.changed_at), "d MMM yyyy HH:mm", { locale: es })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin historial aún</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}