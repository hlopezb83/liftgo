import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Form } from "@/components/ui/form";
import { useHasModuleAccess } from "@/features/users";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { zodResolver } from "@/lib/forms/zodResolver";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { useAdminPaymentIntents, useReviewPaymentIntent } from "../../hooks/paymentIntents";
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

function paymentApprovalDescription(approval: PaymentIntent | undefined) {
  if (!approval) return undefined;
  return `Monto: ${formatCurrency(Number(approval.amount))}. Fecha de transferencia: ${formatDateMty(approval.transfer_date)}. Rastreo: ${approval.tracking_key || "Sin referencia"}.`;
}

interface ApprovalTarget {
  invoiceId: string;
  intentId: string;
}

function usePaymentApproval(invoiceId: string, intents: PaymentIntent[] | undefined, enabled: boolean, busy: boolean) {
  const [selection, setSelection] = useState<ApprovalTarget | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const focusTarget = useRef<ApprovalTarget | null>(null);

  const approval = enabled && selection?.invoiceId === invoiceId
    ? intents?.find((intent) => intent.id === selection.intentId && intent.status === "pending_review")
    : undefined;
  // A confirmation cannot survive an invalidated query, permission or invoice context.
  if (selection && !approval) setSelection(null);

  const requestApproval = useCallback((intentId: string) => {
    if (!enabled || busy) return;
    const target = { invoiceId, intentId };
    focusTarget.current = target;
    setSelection(target);
  }, [invoiceId, enabled, busy]);

  const setSection = useCallback((node: HTMLElement | null) => { sectionRef.current = node; }, []);

  const restoreFocus = useCallback((event: Event) => {
    const section = sectionRef.current;
    const target = focusTarget.current;
    focusTarget.current = null;
    if (!section) return;
    event.preventDefault();
    const action = target?.invoiceId === invoiceId
      ? Array.from(section.querySelectorAll<HTMLButtonElement>("button[data-payment-intent-approve]:not(:disabled)"))
        .find((button) => button.dataset.paymentIntentApprove === target.intentId)
      : undefined;
    action?.focus({ preventScroll: true });
    if (!action || section.ownerDocument.activeElement !== action) section.focus({ preventScroll: true });
  }, [invoiceId]);

  return { approval, setSection, requestApproval, restoreFocus, clear: () => setSelection(null) };
}

export function PaymentIntentsSection({ invoiceId }: Props) {
  const canWrite = useHasModuleAccess("Facturas", "full");
  const { data: intents, isLoading, isError, isSuccess, error, refetch, isFetching } = useAdminPaymentIntents(invoiceId);
  const review = useReviewPaymentIntent();
  const { approval, setSection, requestApproval, restoreFocus, clear } =
    usePaymentApproval(invoiceId, intents, canWrite && isSuccess && !isError, review.isPending);
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
  const approvingId = review.isPending && review.variables?.action === "approve" ? review.variables.intentId : undefined;
  const onReject = useCallback((intentId: string) => { if (canWrite) setRejectId(intentId); }, [canWrite]);

  const submitReject = form.handleSubmit((values) => {
    if (!canWrite || review.isPending || !rejectId) return;
    review.mutate(
      { intentId: rejectId, action: "reject", notes: values.notes.trim() },
      { onSuccess: () => setRejectId(null) },
    );
  });

  const columns = usePaymentIntentsColumns({ onOpenProof: openProof, onApprove: requestApproval, onReject, canWrite, busy: review.isPending, approvingId });

  const table = useLiftgoTable<PaymentIntent>({
    data: intents,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "transfer_date", desc: true }],
    paginated: false,
  });

  const empty = isSuccess && intents?.length === 0;

  return (
    <section ref={setSection} aria-label="Reportes de pago del cliente" tabIndex={-1} className="group">
      {empty ? (
        <p className="sr-only group-focus:not-sr-only group-focus:text-sm group-focus:text-muted-foreground">Sin intentos de pago</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intentos de pago reportados por el cliente</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p role="status" className="p-4 text-sm text-muted-foreground">Cargando reportes de pago…</p>
            ) : isError ? (
              <QueryErrorState bare entity="el listado de reportes de pago" error={error}
                onRetry={() => { void refetch(); }} isRetrying={isFetching} />
            ) : <div className="rounded-md border">
              <DataTableV2 table={table} emptyMessage="Sin intentos de pago" />
            </div>}
          </CardContent>
          <FormDialog
            isPending={review.isPending}
            open={canWrite && !!rejectId}
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
                  <FormDialogCancelButton onCancel={() => setRejectId(null)} disabled={review.isPending} />
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
      )}
      <ConfirmDialog
        open={!!approval}
        onOpenChange={(open) => { if (!open) clear(); }}
        onCloseAutoFocus={restoreFocus}
        title="Aprobar reporte de pago"
        description={paymentApprovalDescription(approval)}
        confirmLabel="Confirmar aprobación"
        loading={review.isPending}
        onConfirm={() => {
          if (approval && !review.isPending) {
            review.mutate({ intentId: approval.id, action: "approve" });
          }
        }}
      />
    </section>
  );
}
