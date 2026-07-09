import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { TextareaField } from "@/components/forms/fields";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Se invoca con el motivo validado (min 3 chars). El caller ejecuta la mutación. */
  onConfirm: (notes: string) => void;
  pending: boolean;
}

const schema = z.object({
  notes: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(3, "Describe el motivo (mínimo 3 caracteres)")),
});
type FormValues = z.input<typeof schema>;

export function SupplierPaymentRejectDialog({ open, onOpenChange, onConfirm, pending }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: "" },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) form.reset({ notes: "" });
  }, [open, form]);

  const submit = form.handleSubmit((values) => onConfirm(values.notes.trim()));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rechazar REP"
      description="Indica el motivo del rechazo del complemento de pago."
    >
      <Form {...form}>
        <form onSubmit={submit} className="space-y-4">
          <TextareaField
            control={form.control}
            name="notes"
            label="Motivo"
            required
            rows={3}
            placeholder="Ej. UUID no corresponde a la factura"
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!form.formState.isValid || pending}
            >
              Rechazar
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
