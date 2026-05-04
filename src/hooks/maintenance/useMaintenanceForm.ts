import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useFormState } from "@/hooks/useFormState";
import {
  useCreateMaintenanceLog, useUpdateMaintenanceLog, type MaintenanceLog,
} from "@/hooks/useMaintenanceLogs";
import type { MaintenanceFormShape } from "@/components/maintenance/MaintenanceFormDialog";
import type { ForkliftMap } from "@/hooks/useForkliftMap";

const initialForm: MaintenanceFormShape = {
  forkliftId: "", serviceType: "", description: "", cost: "",
  performedBy: "", performedAt: new Date(), nextServiceDate: undefined, supplierId: "",
};

interface AvailablePrompt { forkliftId: string; forkliftName: string }

export function useMaintenanceForm(forkliftMap: ForkliftMap) {
  const createLog = useCreateMaintenanceLog();
  const updateLog = useUpdateMaintenanceLog();
  const { form, set, reset } = useFormState(initialForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [availablePrompt, setAvailablePrompt] = useState<AvailablePrompt | null>(null);

  const openCreate = () => { reset(); setEditingLogId(null); setDialogOpen(true); };

  const openEdit = (log: MaintenanceLog) => {
    setEditingLogId(log.id);
    set("forkliftId", log.forklift_id);
    set("serviceType", log.service_type);
    set("description", log.description || "");
    set("cost", log.cost?.toString() || "");
    set("performedBy", log.performed_by || "");
    set("performedAt", log.performed_at ? parseISO(log.performed_at) : new Date());
    set("nextServiceDate", log.next_service_date ? parseISO(log.next_service_date) : undefined);
    set("supplierId", log.supplier_id || "");
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.serviceType) {
      toast.error("Montacargas y tipo de servicio son requeridos");
      return;
    }
    const payload = {
      forklift_id: form.forkliftId,
      service_type: form.serviceType,
      description: form.description || null,
      cost: form.cost ? parseFloat(form.cost) : 0,
      performed_by: form.performedBy || null,
      performed_at: format(form.performedAt, "yyyy-MM-dd"),
      next_service_date: form.nextServiceDate ? format(form.nextServiceDate, "yyyy-MM-dd") : null,
      supplier_id: form.supplierId || null,
    };

    if (editingLogId) {
      updateLog.mutate({ id: editingLogId, ...payload }, {
        onSuccess: () => {
          toast.success("Registro de mantenimiento actualizado");
          setDialogOpen(false);
          setEditingLogId(null);
          reset();
        },
      });
    } else {
      const selectedForklift = forkliftMap.get(form.forkliftId);
      createLog.mutate(payload, {
        onSuccess: () => {
          toast.success("Registro de mantenimiento agregado");
          setDialogOpen(false);
          if (selectedForklift && selectedForklift.status === "maintenance") {
            setAvailablePrompt({ forkliftId: selectedForklift.id, forkliftName: selectedForklift.name });
          }
          reset();
        },
      });
    }
  };

  return {
    form, set,
    dialogOpen,
    setDialogOpen: (open: boolean) => { setDialogOpen(open); if (!open) setEditingLogId(null); },
    editingLogId,
    isPending: editingLogId ? updateLog.isPending : createLog.isPending,
    availablePrompt,
    closeAvailablePrompt: () => setAvailablePrompt(null),
    openCreate,
    openEdit,
    handleSubmit,
  };
}
