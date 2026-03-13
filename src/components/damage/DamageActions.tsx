import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useUpdateDamageRecord } from "@/hooks/useDamageRecords";
import type { DamageRecordWithJoins } from "@/types/rental";
import { useCreateMaintenanceLog } from "@/hooks/useMaintenanceLogs";
import { Wrench, Receipt } from "lucide-react";
import { toast } from "sonner";

interface DamageActionsProps { record: DamageRecordWithJoins; }

export function DamageActions({ record }: DamageActionsProps) {
  const navigate = useNavigate();
  const updateDamage = useUpdateDamageRecord();
  const createMaintenance = useCreateMaintenanceLog();

  const handleCreateWorkOrder = () => {
    createMaintenance.mutate(
      { forklift_id: record.forklift_id, service_type: "Reparación de Daño", description: record.description, cost: record.estimated_cost || 0 },
      { onSuccess: (data) => { updateDamage.mutate({ id: record.id, status: "in_repair", maintenance_log_id: data.id }); toast.success("Orden de mantenimiento creada"); } }
    );
  };

  const handleCreateInvoice = () => {
    navigate(`/invoices/new?damage_id=${record.id}&customer_id=${record.customer_id}&amount=${record.estimated_cost}`);
  };

  if (record.status === "invoiced") return <span className="text-xs text-muted-foreground">Completo</span>;

  return (
    <div className="flex gap-1">
      {record.status === "reported" && (
        <Button variant="ghost" size="sm" onClick={handleCreateWorkOrder} disabled={createMaintenance.isPending}>
          <Wrench className="h-3.5 w-3.5 mr-1" />Reparar
        </Button>
      )}
      {(record.status === "repaired" || record.status === "reported") && (
        <Button variant="ghost" size="sm" onClick={handleCreateInvoice}>
          <Receipt className="h-3.5 w-3.5 mr-1" />Cobrar
        </Button>
      )}
    </div>
  );
}
