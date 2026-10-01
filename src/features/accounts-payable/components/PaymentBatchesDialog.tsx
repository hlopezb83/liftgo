import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { useConfirm } from "@/components/feedback/useConfirm";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { DownloadIcon, DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { useCancelPaymentBatch } from "../hooks/useCancelPaymentBatch";
import { useDownloadPaymentBatch } from "../hooks/useDownloadPaymentBatch";
import { PAYMENT_BATCH_PAGE_SIZE, usePaymentBatches, type PaymentBatchSummary } from "../hooks/usePaymentBatches";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentBatchesDialog({ open, onOpenChange }: Props) {
  const [page, setPage] = useState(0);
  const query = usePaymentBatches(open, page);
  const cancel = useCancelPaymentBatch();
  const download = useDownloadPaymentBatch();
  const confirm = useConfirm();
  const isBusy = cancel.isPending || download.isPending;
  const total = query.data?.total_count ?? 0;

  const handleCancel = async (batch: PaymentBatchSummary) => {
    if (isBusy || batch.cancelled_at || batch.payment_count > 0) return;
    const accepted = await confirm({
      title: "Cancelar lote de pagos",
      description: "Se liberarán únicamente las reservas de este lote sin pagos registrados. Su historial se conservará. El archivo descargado debe descartarse y no usarse para transferencias.",
      confirmLabel: "Cancelar lote",
      destructive: true,
    });
    if (accepted) cancel.mutate(batch.id);
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} isPending={isBusy}
      title="Historial de lotes de pago" width="2xl"
      description="Recupera el Excel original del lote o cancela una reserva sin pagos registrados.">
      {query.isError ? (
        <div role="alert"><QueryErrorState bare entity="el historial de lotes" isRetrying={query.isFetching} onRetry={() => { void query.refetch(); }} /></div>
      ) : query.isPending ? (
        <p role="status" className="py-8 text-center text-muted-foreground">Cargando lotes…</p>
      ) : query.data?.items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Sin lotes de pago registrados.</p>
      ) : (
        <div className="space-y-3">
          {query.data?.items.map((batch) => <PaymentBatchCard key={batch.id} batch={batch}
            disabled={isBusy || query.isFetching} onDownload={() => download.mutate(batch.id)}
            onCancel={() => { void handleCancel(batch); }} />)}
        </div>
      )}
      <FormDialogFooter>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Página {page + 1} · {total} lotes</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 0 || isBusy || query.isFetching} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="outline" disabled={(page + 1) * PAYMENT_BATCH_PAGE_SIZE >= total || isBusy || query.isFetching} onClick={() => setPage(page + 1)}>Siguiente</Button>
            <Button variant="outline" disabled={isBusy} onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </div>
      </FormDialogFooter>
    </FormDialog>
  );
}

function PaymentBatchCard({ batch, disabled, onDownload, onCancel }: {
  batch: PaymentBatchSummary;
  disabled: boolean;
  onDownload: () => void;
  onCancel: () => void;
}) {
  const cancelled = !!batch.cancelled_at;
  const cancellationDate = batch.cancelled_at ? formatDateMty(batch.cancelled_at) : null;
  return (
    <article className="space-y-3 rounded-md border p-4" aria-label={`Lote ${batch.id.slice(0, 8)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">Lote <span className="font-mono" title={batch.id}>{batch.id.slice(0, 8)}</span></p>
          <p className="text-sm text-muted-foreground">{formatDateMty(batch.created_at)} · {batch.bill_count} facturas · {batch.payment_count} pagos registrados</p>
        </div>
        <Badge variant={cancelled ? "secondary" : "outline"}>{cancelled ? "Cancelado" : batch.payment_count > 0 ? "Con pagos" : "Sin pagos"}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {batch.totals_by_currency.map((total) => <p key={total.currency} className="font-mono text-sm">{total.currency === "MXN" ? "MXN " : ""}{formatCurrencyWithCode(total.total, total.currency)}</p>)}
      </div>
      {batch.notes && <p className="break-words text-sm text-muted-foreground">{batch.notes}</p>}
      {cancelled ? (
        <p className="text-sm text-muted-foreground">Cancelado el {cancellationDate}. El layout de este lote no debe usarse para pagar.</p>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={disabled} onClick={onDownload}><DownloadIcon className="mr-2 h-4 w-4" />Descargar original</Button>
          <Button variant="outline" disabled={disabled || batch.payment_count > 0} onClick={onCancel}><DeleteIcon className="mr-2 h-4 w-4" />Cancelar lote</Button>
        </div>
      )}
    </article>
  );
}
