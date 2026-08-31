import { useState } from "react";
import { type ColumnDef } from "@/components/dataTable/v2";
import { EditIcon, StampIcon, DocumentIcon, FileCode2, ErrorIcon, RefreshIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { businessBlockSummary, describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyError } from "@/lib/ui/appFeedback";
import { RepBadge } from "../../components/invoice-detail/RepBadge";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";
import { PAYMENT_METHODS } from "../../lib/paymentMethods";
import { useStampPaymentComplement } from "./cfdi/usePaymentComplement";
import { useRefreshRepCancellationStatus } from "./cfdi/useRefreshCancellationStatus";

// BL-R8-28: etiquetas ES para payments.payment_method (transfer/cash/check/card).
const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

type Payment = Tables<"payments">;

async function downloadRep(paymentId: string, format: CfdiFormat) {
  try {
    await downloadCfdiBlob({ payment_id: paymentId }, format, `REP-${paymentId}.${format}`);
  } catch (err: unknown) {
    notifyError({ error: err, message: "Error al descargar REP" });
  }
}

/**
 * Construye columnas de la tabla de pagos + estado de edición.
 * Aísla la lógica de las acciones REP (timbrar/cancelar/descargar).
 */
export function usePaymentHistoryColumns(ppdStamped: boolean, allowRepMutations: boolean = ppdStamped) {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  // Fix B v7.90.0: el motivo de cancelación de REP ya no se hardcodea a "02";
  // se elige en un diálogo dedicado (CancelRepDialog).
  const [cancelRepPaymentId, setCancelRepPaymentId] = useState<string | null>(null);
  const stampRep = useStampPaymentComplement();
  // FIX R4-04: permite consultar al SAT el estado de una cancelación REP
  // en proceso (la edge function ya acepta payment_id).
  const refreshRepCancel = useRefreshRepCancellationStatus();

  const columns: ColumnDef<Payment>[] = (() => {
    const base: ColumnDef<Payment>[] = [
      {
        id: "payment_date", header: "Fecha", accessorKey: "payment_date",
        cell: ({ row }) => <span className="text-sm">{formatDateMty(row.original.payment_date)}</span>,
      },
      {
        id: "payment_method", header: "Método", accessorKey: "payment_method",
        cell: ({ row }) => (
          <span className="text-sm">
            {(row.original.payment_method && PAYMENT_METHOD_LABELS[row.original.payment_method]) || row.original.payment_method || "—"}
          </span>
        ),
      },
      {
        id: "reference_number", header: "Referencia", accessorKey: "reference_number",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reference_number || "—"}</span>
        ),
      },
      {
        id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { kind: "number" },
        cell: ({ row }) => {
          // Ronda D·#2: el monto se formatea CON su propia moneda (no siempre MXN),
          // igual que en Cuentas por Pagar; el badge solo refuerza la divisa foránea.
          const currency = (row.original as Payment & { currency?: string | null }).currency ?? "MXN";
          return (
            <div className="flex items-center justify-end gap-2">
              <ReconciliationBadge paymentId={row.original.id} />
              <span className="font-mono">{formatCurrencyWithCode(Number(row.original.amount), currency)}</span>
            </div>
          );
        },
      },
    ];

    if (ppdStamped) {
      base.push({
        id: "rep_status", header: "REP", enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const status = (p.rep_cfdi_status as string | null) ?? "none";
          const repNumber = (p.rep_number as string | null) ?? null;
          // FIX R4-04: cancelación REP en proceso ante el SAT.
          const repCancelPending = (p.rep_cancellation_status as string | null) === "pending";
          return (
            <div className="flex items-center gap-1.5">
              {repNumber && (
                <span className="font-mono text-xs text-muted-foreground">{repNumber}</span>
              )}
              <RepBadge status={status} />
              {status === "stamped" && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP PDF" aria-label="Descargar REP PDF" onClick={() => downloadRep(p.id, "pdf")}>
                    <DocumentIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP XML" aria-label="Descargar REP XML" onClick={() => downloadRep(p.id, "xml")}>
                    <FileCode2 className="h-3.5 w-3.5" />
                  </Button>
                  {allowRepMutations && !repCancelPending && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      title="Cancelar REP"
                      aria-label="Cancelar REP"
                      onClick={() => setCancelRepPaymentId(p.id)}
                    >
                      <ErrorIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {repCancelPending && (
                    <>
                      <Badge variant="outline" className="border-warning/30 text-warning text-[10px]">
                        Cancelación REP en proceso
                      </Badge>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Consultar estado SAT"
                        aria-label="Consultar estado SAT"
                        disabled={refreshRepCancel.isPending}
                        onClick={() => refreshRepCancel.mutate(p.id)}
                      >
                        <RefreshIcon className={`h-3.5 w-3.5 ${refreshRepCancel.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    </>
                  )}
                </>
              )}
              {allowRepMutations && (status === "none" || status === "error") && (
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={stampRep.isPending}
                  title={
                    stampRep.isPending
                      ? "Hay un timbrado de REP en curso"
                      : "Timbrar complemento de pago"
                  }
                  onClick={() => {
                    if (stampRep.isPending) return;
                    stampRep.mutate(p.id);
                  }}
                >
                  <StampIcon className="h-3 w-3 mr-1" />
                  {stampRep.isPending && stampRep.variables === p.id
                    ? "Timbrando…"
                    : "Timbrar REP"}
                </Button>
              )}

            </div>
          );
        },
      });
    }

    base.push({
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        // R10 Bloque 6: si el pago tiene REP timbrado, editar montos/fecha
        // rompería el complemento CFDI. Bloqueo explicable compartido.
        const repLocked = (p.rep_cfdi_status as string | null) === "stamped";
        const block = repLocked ? describeBusinessBlock("payment_rep_stamped_locked") : null;
        const title = block ? businessBlockSummary(block) : "Editar pago";
        return (
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => !repLocked && setEditingPayment(p)}
            aria-label="Editar pago"
            title={title}
            disabled={repLocked}
          >
            <EditIcon className="h-3.5 w-3.5" />
          </Button>
        );
      },
    });


    return base;
  })();

  return { columns, editingPayment, setEditingPayment, cancelRepPaymentId, setCancelRepPaymentId };
}
