import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useAdminPaymentIntents, useReviewPaymentIntent } from "@/features/portal";
import { zodResolver } from "@/lib/forms/zodResolver";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import {
  usePaymentIntentsColumns,
  type PaymentIntent,
} from "./usePaymentIntentsColumns";

interface Props {
  invoiceId: string;
}

const schema = z.object({
  notes: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(3, "Describe el motivo (mínimo 3 caracteres)")),
});
type FormValues = z.input<typeof schema>;

export function PaymentIntentsSection({ invoiceId }: Props) {
  const { data: intents } = useAdminPaymentIntents(invoiceId);
  const review = useReviewPaymentIntent();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: "" },
    mode: "onChange",
  });

  useEffect(() => {
     
    if (rejectId) form.reset({ notes: "" });
  }, [rejectId, form]);

  const openProof = useCallback(
    (path: string) =>
      openStorageFile("payment-proofs", path, {
        errorMessage: "No se pudo abrir el comprobante",
      }),
    [],
  );
  const onApprove = useCallback(
    (intentId: string) => review.mutate({ intentId, action: "approve" }),
    [review],
  );
  const onReject = useCallback((intentId: string) => setRejectId(intentId), []);

  const submitReject = form.handleSubmit((values) => {
    if (!rejectId) return;
    review.mutate(
      { intentId: rejectId, action: "reject", notes: values.notes.trim() },
      { onSuccess: () => setRejectId(null) },
    );
  });

  const columns = usePaymentIntentsColumns({ onOpenProof: openProof, onApprove, onReject });

  const table = useLiftgoTable<PaymentIntent>({
    data: intents,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "transfer_date", desc: true }],
    paginated: false,
  });

  if (!intents || intents.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intentos de pago reportados por el cliente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border">
          <DataTableV2 table={table} emptyMessage="Sin intentos de pago" />
        </div>
      </CardContent>

      <FormDialog
      isPending={review.isPending}
        open={!!rejectId}
        onOpenChange={(o) => !o && setRejectId(null)}
        title="Rechazar reporte de pago"
        description="El motivo será visible para el cliente en el portal."
      >
        <Form {...form}>
          <form onSubmit={submitReject} className="space-y-4">
            <TextareaField
              control={form.control}
              name="notes"
              label="Motivo del rechazo"
              required
              rows={3}
              placeholder="Motivo del rechazo (visible para el cliente)"
            />
            <FormDialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectId(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!form.formState.isValid || review.isPending}
              >
                Confirmar
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      </FormDialog>
    </Card>
  );
}
