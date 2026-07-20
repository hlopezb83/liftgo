import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { CANCELLATION_REASONS } from "@/lib/domain/satCatalogs";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useCancelCfdi } from "../../hooks/invoices/cfdi/useCancelCfdi";

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

interface CancelCfdiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceTotal: number;
  onSuccess: () => void;
}

export function CancelCfdiDialog({
  open, onOpenChange, invoiceId, invoiceTotal, onSuccess,
}: CancelCfdiDialogProps) {
  const cancelCfdi = useCancelCfdi();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { motive: "02", substitutionUuid: "" },
  });

  useEffect(() => {
    if (open) form.reset({ motive: "02", substitutionUuid: "" });
  }, [open, form]);

  const motive = useWatch({ control: form.control, name: "motive" });
  const needsSubstitution = motive === "01";

  const onSubmit = (values: FormValues) => {
    cancelCfdi.mutate(
      {
        invoiceId,
        motive: values.motive,
        substitutionUuid: needsSubstitution ? values.substitutionUuid.trim() : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess();
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancelar CFDI"
      description="Selecciona el motivo de cancelación según el SAT."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {invoiceTotal > 1000 && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              ⚠️ Facturas mayores a $1,000 MXN requieren aprobación del receptor ante el SAT.
            </div>
          )}
          <SelectField
            control={form.control}
            name="motive"
            label="Motivo"
            required
            options={CANCELLATION_REASONS.map((r) => ({ value: r.code, label: r.label }))}
          />
          {needsSubstitution && (
            <TextField
              control={form.control}
              name="substitutionUuid"
              label="UUID de factura sustituta"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              description="Captura el UUID (folio fiscal) del CFDI que sustituye a este."
            />
          )}
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancelCfdi.isPending}>
              {cancelCfdi.isPending ? "Cancelando..." : "Confirmar Cancelación"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
