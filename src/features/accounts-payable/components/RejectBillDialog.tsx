import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { useRejectSupplierBill } from "../hooks/useBillApprovalMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
}

const schema = z.object({
  notes: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(3, "Describe el motivo (mínimo 3 caracteres)")),
});
type FormValues = z.input<typeof schema>;

export function RejectBillDialog({ open, onOpenChange, billId, billNumber }: Props) {
  const reject = useRejectSupplierBill();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: "" },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) form.reset({ notes: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit((values) => {
    reject.mutate(
      { billId, notes: values.notes.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechazar factura ${billNumber}`}
      description="La factura quedará marcada como rechazada y no podrá pagarse. Indica el motivo para que quede registrado en la bitácora."
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextareaField
            control={form.control}
            name="notes"
            label="Motivo del rechazo"
            required
            rows={4}
            placeholder="Describe el motivo del rechazo"
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!form.formState.isValid || reject.isPending}
            >
              {reject.isPending ? "Rechazando…" : "Rechazar"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
