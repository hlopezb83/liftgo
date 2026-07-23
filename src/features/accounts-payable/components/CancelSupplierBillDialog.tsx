import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useCancelSupplierBill } from "../hooks/useSupplierBillMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  onCancelled?: () => void;
}

const schema = z.object({
  reason: z.string().default(""),
});
type FormValues = z.infer<typeof schema>;

export function CancelSupplierBillDialog({
  open, onOpenChange, billId, billNumber, onCancelled,
}: Props) {
  const cancel = useCancelSupplierBill();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit((values) => {
    cancel.mutate(
      { id: billId, reason: values.reason.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          onCancelled?.();
        },
      },
    );
  });

  return (
    <FormDialog
      isPending={cancel.isPending}
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancelar factura ${billNumber}`}
      description="Esta acción marcará la factura como cancelada. Solo se permite cuando no tiene pagos aplicados."
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextareaField
            control={form.control}
            name="reason"
            label="Motivo (opcional)"
            rows={3}
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelando…" : "Cancelar factura"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
