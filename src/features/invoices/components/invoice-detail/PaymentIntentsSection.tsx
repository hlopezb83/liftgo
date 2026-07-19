import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useAdminPaymentIntents, useReviewPaymentIntent } from "@/features/portal";
import { PAYMENT_INTENT_STATUS as STATUS_LABEL } from "@/lib/domain/paymentIntentStatus";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { zodResolver } from "@/lib/forms/zodResolver";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { formatDateDisplay } from "@/lib/utils";

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

type PaymentIntent = NonNullable<ReturnType<typeof useAdminPaymentIntents>["data"]>[number];

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

  const openProof = (path: string) =>
    openStorageFile("payment-proofs", path, { errorMessage: "No se pudo abrir el comprobante" });

  const submitReject = form.handleSubmit((values) => {
    if (!rejectId) return;
    review.mutate(
      { intentId: rejectId, action: "reject", notes: values.notes.trim() },
      { onSuccess: () => setRejectId(null) },
    );
  });


  const columns: ColumnDef<PaymentIntent>[] = [
    {
      id: "transfer_date",
      header: "Fecha",
      accessorKey: "transfer_date",
      cell: ({ row }) => formatDateDisplay(row.original.transfer_date),
    },
    {
      id: "amount",
      header: "Monto",
      accessorKey: "amount",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span>
      ),
    },
    {
      id: "bank",
      header: "Banco",
      enableSorting: false,
      cell: ({ row }) =>
        `${row.original.sender_bank ?? "—"}${
          row.original.sender_last4 ? ` ····${row.original.sender_last4}` : ""
        }`,
    },
    {
      id: "tracking_key",
      header: "Rastreo",
      accessorKey: "tracking_key",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.tracking_key ?? "—"}</span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      accessorKey: "status",
      cell: ({ row }) => {
        const meta = STATUS_LABEL[row.original.status] ?? {
          label: row.original.status,
          variant: "outline" as const,
        };
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const intent = row.original;
        const pending = intent.status === "pending_review";
        return (
          <div className="flex justify-end gap-2">
            {intent.proof_url && (
              <Button size="sm" variant="ghost" onClick={() => openProof(intent.proof_url ?? "")}>
                Comprobante
              </Button>
            )}
            {pending && (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    review.mutate({ intentId: intent.id, action: "approve" })
                  }
                >
                  Aprobar
                </Button>

                <Button size="sm" variant="destructive" onClick={() => setRejectId(intent.id)}>
                  Rechazar
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

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
