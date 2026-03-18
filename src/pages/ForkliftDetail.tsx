import { useParams, useNavigate } from "react-router-dom";
import { useForklift, useDeleteForklift, useStatusLogs } from "@/hooks/useForklifts";
import { useBookings } from "@/hooks/useBookings";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
import { useForkliftFinancials } from "@/hooks/useForkliftFinancials";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentAttachments } from "@/components/DocumentAttachments";
import { NotesCard } from "@/components/NotesCard";
import { DamagePhotosSection } from "@/components/damage/DamagePhotosSection";
import { ForkliftSpecsCard } from "@/components/forklift-detail/ForkliftSpecsCard";
import { ForkliftRatesCard } from "@/components/forklift-detail/ForkliftRatesCard";
import { ForkliftBookingsList } from "@/components/forklift-detail/ForkliftBookingsList";
import { ForkliftMaintenanceList } from "@/components/forklift-detail/ForkliftMaintenanceList";
import { ForkliftStatusHistory } from "@/components/forklift-detail/ForkliftStatusHistory";
import { StatusChangeCard } from "@/components/forklift-detail/StatusChangeCard";
import { ForkliftFinancialCard } from "@/components/forklift-detail/ForkliftFinancialCard";
import { ForkliftHourometerHistory } from "@/components/forklift-detail/ForkliftHourometerHistory";

export default function ForkliftDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: forklift, isLoading } = useForklift(id);
  const { data: logs } = useStatusLogs(id);
  const { data: bookings } = useBookings(id);
  const { data: maintenanceLogs } = useMaintenanceLogs(id);
  const { data: financials, isLoading: loadingFinancials } = useForkliftFinancials(id);
  const { data: locationData } = useQuery({
    queryKey: ["forklift-location", id],
    enabled: !!id,
    queryFn: async () => {
      // Try contract usage_location first
      const { data: contract } = await supabase
        .from("contracts")
        .select("usage_location")
        .eq("forklift_id", id!)
        .in("status", ["active", "signed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contract?.usage_location) return contract.usage_location;
      // Fallback to latest delivery address
      const { data: delivery } = await supabase
        .from("deliveries")
        .select("address")
        .eq("forklift_id", id!)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return delivery?.address || null;
    },
  });
  const deleteForklift = useDeleteForklift();

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!forklift) return <div className="p-6 text-muted-foreground">Montacargas no encontrado</div>;

  const handleDelete = () => {
    deleteForklift.mutate(forklift.id, {
      onSuccess: () => { toast.success("Montacargas eliminado"); navigate("/fleet"); },
      onError: () => toast.error("Error al eliminar"),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <DetailPageHeader
        title={forklift.name}
        subtitle={`${forklift.model} — ${forklift.manufacturer}`}
        backTo="/fleet"
        badges={<StatusBadge status={forklift.status} />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/fleet/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-1" /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" /> Eliminar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {forklift.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto eliminará permanentemente este montacargas y todos sus registros relacionados. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ForkliftSpecsCard forklift={forklift} />
        <ForkliftRatesCard forklift={forklift} />
      </div>

      {forklift.notes && (
        <NotesCard value={forklift.notes} readOnly />
      )}

      <ForkliftFinancialCard financials={financials} isLoading={loadingFinancials} />
      <StatusChangeCard forkliftId={forklift.id} currentStatus={forklift.status} />
      <ForkliftBookingsList bookings={bookings || []} />
      <ForkliftMaintenanceList logs={maintenanceLogs || []} />
      {financials && <ForkliftHourometerHistory history={financials.hourometer_history} />}
      {id && <DamagePhotosSection entityType="damage_forklift" entityId={id} title="Fotos de Daño" />}
      {id && <DocumentAttachments entityType="forklift" entityId={id} />}
      <ForkliftStatusHistory logs={logs || []} />
    </div>
  );
}
