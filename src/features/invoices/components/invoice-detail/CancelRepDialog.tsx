import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { SelectField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { CANCELLATION_REASONS } from "@/lib/domain/satCatalogs";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useCancelPaymentComplement } from "../../hooks/invoices/cfdi/usePaymentComplement";

// Motivos válidos para REP. Omitimos "01" porque exigiría un REP sustituto ya
// timbrado; ese flujo no existe hoy en la app.
const REP_MOTIVE_OPTIONS = CANCELLATION_REASONS.filter((r) => r.code !== "01");

const schema = z.object({
  motive: z.enum(["02", "03", "04"]),
});
type FormValues = z.infer<typeof schema>;

interface CancelRepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  onSuccess?: () => void;
}

export function CancelRepDialog({ open, onOpenChange, paymentId, onSuccess }: CancelRepDialogProps) {
  const cancelRep = useCancelPaymentComplement();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { motive: "02" },
  });

  useEffect(() => {
    if (open) form.reset({ motive: "02" });
  }, [open, form]);

  const onSubmit = (values: FormValues) => {
    if (!paymentId) return;
    cancelRep.mutate(
      { paymentId, motive: values.motive },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancelar Complemento de Pago"
      description="Selecciona el motivo de cancelación del REP según el SAT."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <SelectField
            control={form.control}
            name="motive"
            label="Motivo"
            required
            options={REP_MOTIVE_OPTIONS.map((r) => ({ value: r.code, label: r.label }))}
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancelRep.isPending}>
              {cancelRep.isPending ? "Cancelando..." : "Confirmar Cancelación"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
