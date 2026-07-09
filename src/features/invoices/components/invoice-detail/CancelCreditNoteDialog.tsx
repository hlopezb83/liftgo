import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/forms/fields";
import { CANCELLATION_REASONS } from "@/lib/domain/satCatalogs";
import { useCancelCreditNote, type CreditNote } from "../../hooks/creditNotes/useCreditNotes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z
  .object({
    motive: z.string().min(1),
    substitutionUuid: z.string().default(""),
  })
  .refine((v) => v.motive !== "01" || UUID_RE.test(v.substitutionUuid.trim()), {
    path: ["substitutionUuid"],
    message: "UUID inválido",
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNote: CreditNote;
}

export function CancelCreditNoteDialog({ open, onOpenChange, creditNote }: Props) {
  const cancelMutation = useCancelCreditNote();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { motive: "02", substitutionUuid: "" },
  });

  useEffect(() => {
    if (open) form.reset({ motive: "02", substitutionUuid: "" });
  }, [open, form]);

  const needsSub = form.watch("motive") === "01";

  const onSubmit = (values: FormValues) => {
    cancelMutation.mutate(
      {
        creditNoteId: creditNote.id,
        motive: values.motive,
        substitutionUuid: needsSub ? values.substitutionUuid.trim() : null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancelar Nota de Crédito ${creditNote.credit_note_number}`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <SelectField
            control={form.control}
            name="motive"
            label="Motivo"
            required
            options={CANCELLATION_REASONS.map((r) => ({ value: r.code, label: r.label }))}
          />
          {needsSub && (
            <TextField
              control={form.control}
              name="substitutionUuid"
              label="UUID de NC sustituta"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          )}
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelación"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
