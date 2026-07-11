import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { TextareaField } from "@/components/forms/fields";
import { useAdminPaymentIntents, useReviewPaymentIntent } from "@/features/portal";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { PAYMENT_INTENT_STATUS as STATUS_LABEL } from "@/lib/domain/paymentIntentStatus";

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

  if (!intents || intents.length === 0) return null;

  const openProof = (path: string) =>
    openStorageFile("payment-proofs", path, { errorMessage: "No se pudo abrir el comprobante" });

  const submitReject = form.handleSubmit((values) => {
    if (!rejectId) return;
    const intent = intents.find((x) => x.id === rejectId);
    if (!intent) return;
    review.mutate(
      {
        intentId: rejectId,
        action: "reject",
        notes: values.notes.trim(),
        invoiceId,
        amount: Number(intent.amount),
        transferDate: intent.transfer_date,
        trackingKey: intent.tracking_key,
      },
      { onSuccess: () => setRejectId(null) },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intentos de pago reportados por el cliente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Banco</th>
              <th className="text-left px-3 py-2">Rastreo</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {intents.map((i, idx) => {
              const meta = STATUS_LABEL[i.status] ?? { label: i.status, variant: "outline" as const };
              const pending = i.status === "pending_review";
              return (
                <tr key={i.id} className={idx % 2 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2">{formatDateDisplay(i.transfer_date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(i.amount))}</td>
                  <td className="px-3 py-2">
                    {i.sender_bank ?? "—"}{i.sender_last4 ? ` ····${i.sender_last4}` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{i.tracking_key ?? "—"}</td>
                  <td className="px-3 py-2"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {i.proof_url && (
                      <Button size="sm" variant="ghost" onClick={() => openProof(i.proof_url ?? "")}>
                        Comprobante
                      </Button>
                    )}
                    {pending && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            review.mutate({
                              intentId: i.id,
                              action: "approve",
                              invoiceId,
                              amount: Number(i.amount),
                              transferDate: i.transfer_date,
                              trackingKey: i.tracking_key,
                            })
                          }
                        >
                          Aprobar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setRejectId(i.id)}>
                          Rechazar
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              <Button type="button" variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
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
