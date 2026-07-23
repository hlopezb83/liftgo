import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useApproveSupplierBill } from "../hooks/useBillApprovalMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
}

const schema = z.object({
  notes: z.string().default(""),
});
type FormValues = z.infer<typeof schema>;

export function ApproveBillDialog({ open, onOpenChange, billId, billNumber }: Props) {
  const approve = useApproveSupplierBill();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: "" },
  });

  useEffect(() => {
    if (open) form.reset({ notes: "" });
  }, [open, form]);

  const onSubmit = (values: FormValues) => {
    approve.mutate(
      { billId, notes: values.notes.trim() || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <FormDialog
      isPending={approve.isPending}
      open={open}
      onOpenChange={onOpenChange}
      title={`Aprobar factura ${billNumber}`}
      description="Al aprobar, la factura quedará habilitada para registrar pagos."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <TextareaField
            control={form.control}
            name="notes"
            label="Notas (opcional)"
            rows={3}
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={approve.isPending}>
              {approve.isPending ? "Aprobando…" : "Aprobar"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
