import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  useCreateMaintenanceLog, useUpdateMaintenanceLog, type MaintenanceLog,
} from "./useMaintenanceLogs";
import type { Tables } from "@/integrations/supabase/types";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  maintenanceFormSchema, initialMaintenanceForm, maintenanceLogToFormValues,
  buildMaintenancePayload, type MaintenanceFormValues,
} from "../../lib/maintenanceFormHelpers";

export { maintenanceFormSchema, type MaintenanceFormValues };

type ForkliftMap = Map<string, Tables<"forklifts">>;
interface AvailablePrompt { forkliftId: string; forkliftName: string }

export function useMaintenanceForm(forkliftMap: ForkliftMap) {
  const createLog = useCreateMaintenanceLog();
  const updateLog = useUpdateMaintenanceLog();
  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: initialMaintenanceForm,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [availablePrompt, setAvailablePrompt] = useState<AvailablePrompt | null>(null);

  const openCreate = () => { form.reset(initialMaintenanceForm); setEditingLogId(null); setDialogOpen(true); };

  const openEdit = (log: MaintenanceLog) => {
    setEditingLogId(log.id);
    form.reset(maintenanceLogToFormValues(log));
    setDialogOpen(true);
  };

  const onSubmit = (values: MaintenanceFormValues) => {
    const payload = buildMaintenancePayload(values);
    if (editingLogId) {
      updateLog.mutate({ id: editingLogId, ...payload }, {
        onSuccess: () => {
          notifySuccess("Registro de mantenimiento actualizado");
          setDialogOpen(false);
          setEditingLogId(null);
          form.reset(initialMaintenanceForm);
        },
      });
      return;
    }
    const selectedForklift = forkliftMap.get(values.forkliftId);
    createLog.mutate(payload, {
      onSuccess: () => {
        notifySuccess("Registro de mantenimiento agregado");
        setDialogOpen(false);
        if (selectedForklift && selectedForklift.status === "maintenance") {
          setAvailablePrompt({ forkliftId: selectedForklift.id, forkliftName: selectedForklift.name });
        }
        form.reset(initialMaintenanceForm);
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
