import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  useCreateMaintenanceLog, useUpdateMaintenanceLog, type MaintenanceLog,
} from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import type { Tables } from "@/integrations/supabase/types";

type ForkliftMap = Map<string, Tables<"forklifts">>;

export const maintenanceFormSchema = z.object({
  forkliftId: z.string().min(1, "Montacargas requerido"),
  serviceType: z.string().min(1, "Tipo de servicio requerido"),
  description: z.string(),
  cost: z.string(),
  performedBy: z.string(),
  performedAt: z.date(),
  nextServiceDate: z.date().optional(),
  supplierId: z.string(),
});

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

const initialForm: MaintenanceFormValues = {
  forkliftId: "", serviceType: "", description: "", cost: "",
  performedBy: "", performedAt: new Date(), nextServiceDate: undefined, supplierId: "",
};

interface AvailablePrompt { forkliftId: string; forkliftName: string }

export function useMaintenanceForm(forkliftMap: ForkliftMap) {
  const createLog = useCreateMaintenanceLog();
  const updateLog = useUpdateMaintenanceLog();
  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: initialForm,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [availablePrompt, setAvailablePrompt] = useState<AvailablePrompt | null>(null);

  const openCreate = () => { form.reset(initialForm); setEditingLogId(null); setDialogOpen(true); };

  const openEdit = (log: MaintenanceLog) => {
    setEditingLogId(log.id);
    form.reset({
      forkliftId: log.forklift_id,
      serviceType: log.service_type,
      description: log.description || "",
      cost: log.cost?.toString() || "",
      performedBy: log.performed_by || "",
      performedAt: log.performed_at ? parseISO(log.performed_at) : new Date(),
      nextServiceDate: log.next_service_date ? parseISO(log.next_service_date) : undefined,
      supplierId: log.supplier_id || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: MaintenanceFormValues) => {
    const payload = {
      forklift_id: values.forkliftId,
      service_type: values.serviceType,
      description: values.description || null,
      cost: values.cost ? parseFloat(values.cost) : 0,
      performed_by: values.performedBy || null,
      performed_at: format(values.performedAt, "yyyy-MM-dd"),
      next_service_date: values.nextServiceDate ? format(values.nextServiceDate, "yyyy-MM-dd") : null,
      supplier_id: values.supplierId || null,
    };

    if (editingLogId) {
      updateLog.mutate({ id: editingLogId, ...payload }, {
        onSuccess: () => {
          toast.success("Registro de mantenimiento actualizado");
          setDialogOpen(false);
          setEditingLogId(null);
          form.reset(initialForm);
        },
      });
      return;
    }

    const selectedForklift = forkliftMap.get(values.forkliftId);
    createLog.mutate(payload, {
      onSuccess: () => {
        toast.success("Registro de mantenimiento agregado");
        setDialogOpen(false);
        if (selectedForklift && selectedForklift.status === "maintenance") {
          setAvailablePrompt({ forkliftId: selectedForklift.id, forkliftName: selectedForklift.name });
        }
        form.reset(initialForm);
      },
    });
  };

  return {
    form,
    dialogOpen,
    setDialogOpen: (open: boolean) => { setDialogOpen(open); if (!open) setEditingLogId(null); },
    editingLogId,
    isPending: editingLogId ? updateLog.isPending : createLog.isPending,
    availablePrompt,
    closeAvailablePrompt: () => setAvailablePrompt(null),
    openCreate,
    openEdit,
    handleSubmit: form.handleSubmit(onSubmit),
  };
}
