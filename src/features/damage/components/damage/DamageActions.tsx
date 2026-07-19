import { MaintenanceIcon, InvoiceIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useCreateMaintenanceLog } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import type { DamageRecordWithJoins } from "@/types/rental";
import { useUpdateDamageRecord } from "../../hooks/useDamageRecords";
import { chargeableDamageCost } from "../../lib/chargeableDamageCost";

interface DamageActionsProps { record: DamageRecordWithJoins; }

export function DamageActions({ record }: DamageActionsProps) {
  const navigate = useNavigateTransition();
  const updateDamage = useUpdateDamageRecord();
  const createMaintenance = useCreateMaintenanceLog();

  const handleCreateWorkOrder = () => {
    // La orden de trabajo conserva el estimado (es el presupuesto de la orden).
    createMaintenance.mutate(
      { forklift_id: record.forklift_id, service_type: "Reparación de Daño", description: record.description, cost: record.estimated_cost || 0 },
      { onSuccess: (data) => { updateDamage.mutate({ id: record.id, status: "in_repair", maintenance_log_id: data.id }); notifySuccess("Orden de mantenimiento creada"); } }
    );
  };

  // Fix A v7.90.0: al cobrar, si ya hay costo real de la reparación, ese manda.
  const cost = chargeableDamageCost(record);
  const handleCreateInvoice = () => {
    navigate(`/invoices/new?damage_id=${record.id}&customer_id=${record.customer_id}&amount=${cost ?? ""}`);
  };

  if (record.status === "invoiced") return <span className="text-xs text-muted-foreground">Completo</span>;

  return (
    <div className="flex gap-1">
      {record.status === "reported" && (
        <Button variant="ghost" size="sm" onClick={handleCreateWorkOrder} disabled={createMaintenance.isPending}>
          <MaintenanceIcon className="h-3.5 w-3.5 mr-1" />Reparar
        </Button>
      )}
      {(record.status === "repaired" || record.status === "reported") && (
        <Button variant="ghost" size="sm" onClick={handleCreateInvoice} disabled={cost == null}>
          <InvoiceIcon className="h-3.5 w-3.5 mr-1" />Cobrar
        </Button>
      )}
    </div>
  );
}
