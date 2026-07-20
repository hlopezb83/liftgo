import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyField, SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { SecurityIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCreateMaintenancePolicy } from "@/features/maintenance";
import { SERVICE_TYPES } from "@/lib/constants";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";

interface PostBookingPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forkliftId: string;
  forkliftName: string;
  onSkip: () => void;
}

const schema = z.object({
  providerName: z.string().trim().min(1, "El nombre del proveedor es requerido"),
  monthlyCost: z.number().min(0).nullable().default(null),
  serviceType: z.string().min(1),
  description: z.string().default(""),
});
type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  providerName: "",
  monthlyCost: null,
  serviceType: "Póliza de Mantenimiento",
  description: "",
};

export function PostBookingPolicyDialog({ open, onOpenChange, forkliftId, forkliftName, onSkip }: PostBookingPolicyDialogProps) {
  const createPolicy = useCreateMaintenancePolicy();
  const [showForm, setShowForm] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form.reset() de RHF debe
    // ejecutarse fuera del render; es el patrón oficial para resincronizar el form al cerrar.
    if (!open) { setShowForm(false); form.reset(DEFAULTS); }
  }, [open, form]);

  const handleCreate = form.handleSubmit((values) => {
    createPolicy.mutate(
      {
        forklift_id: forkliftId,
        provider_name: values.providerName.trim(),
        monthly_cost: values.monthlyCost ?? 0,
        service_type: values.serviceType,
        description: values.description.trim() || undefined,
      },
      {
        onSuccess: () => { notifySuccess("Póliza de mantenimiento creada"); onSkip(); },
      }
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onSkip(); onOpenChange(o); }}
      width="md"
      title="Póliza de Mantenimiento"
      description={
        <span className="flex items-start gap-2">
          <SecurityIcon className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <span>El montacargas <span className="font-medium">{forkliftName}</span> no tiene una póliza de mantenimiento activa. ¿Deseas crear una?</span>
        </span>
      }
    >
      {!showForm ? (
        <FormDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => setShowForm(true)}>
            <SecurityIcon className="h-4 w-4 mr-2" /> Crear Póliza
          </Button>
          <Button variant="outline" className="w-full" onClick={onSkip}>
            Omitir por Ahora
          </Button>
        </FormDialogFooter>
      ) : (
        <Form {...form}>
          <form onSubmit={handleCreate} className="space-y-4">
            <TextField control={form.control} name="providerName" label="Proveedor" required placeholder="Nombre del proveedor" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CurrencyField control={form.control} name="monthlyCost" label="Costo Mensual" currency="MXN" />
              <SelectField
                control={form.control}
                name="serviceType"
                label="Tipo de Servicio"
                options={SERVICE_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <TextareaField
              control={form.control}
              name="description"
              label="Descripción"
              rows={2}
              placeholder="Descripción opcional de la póliza"
            />

            <FormDialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onSkip}>Omitir</Button>
              <Button type="submit" disabled={createPolicy.isPending}>
                {createPolicy.isPending ? "Creando..." : "Crear Póliza"}
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      )}
    </FormDialog>
  );
}
