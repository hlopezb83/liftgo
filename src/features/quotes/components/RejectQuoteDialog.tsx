import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { ErrorIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";

interface Props {
  quoteNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

// BL-R8-19 (R8-FE-15): mismo patrón que CloseLostDialog del CRM — rechazar
// sin motivo dejaba rejection_reason NULL pese a tener columna.
const schema = z.object({
  reason: z.string().trim().min(1, "Describe el motivo del rechazo"),
});
type FormValues = z.infer<typeof schema>;

export function RejectQuoteDialog({ quoteNumber, open, onOpenChange, onConfirm, isPending }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);

  const handleSubmit = form.handleSubmit((values) => onConfirm(values.reason.trim()));

  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title="Rechazar cotización"
      description={
        <>La cotización <span className="font-medium">{quoteNumber}</span> pasará a estado Rechazada. El motivo quedará registrado.</>
      }
    >
      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextareaField
            control={form.control}
            name="reason"
            label="Motivo del rechazo"
            required
            rows={3}
            placeholder="Ej. El cliente encontró mejor precio / pospondrá el proyecto"
          />
          <FormDialogFooter>
            <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isPending} />
            <Button type="submit" variant="destructive" disabled={isPending}>
              <ErrorIcon className="h-4 w-4 mr-1" />
              Confirmar rechazo
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
