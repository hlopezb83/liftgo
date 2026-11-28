import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@/components/dataTable/v2";
import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { EditIcon, StampIcon, DocumentIcon, FileCode2, ErrorIcon, RefreshIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import { useHasModuleAccess } from "@/features/users";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyError } from "@/lib/ui/appFeedback";
import { RepBadge } from "../components/invoice-detail/RepBadge";
import { canStampPaymentRep } from "../lib/canStampPaymentRep";
import { downloadCfdiBlob, type CfdiFormat } from "../lib/downloadCfdiBlob";
import { getPaymentMethodLabel } from "../lib/paymentMethods";
import { useStampPaymentComplement } from "./cfdi/usePaymentComplement";
import { useRefreshRepCancellationStatus } from "./cfdi/useRefreshCancellationStatus";

type Payment = Tables<"payments">;

function getEditPaymentBlock(payment: Payment, hasRepColumn: boolean, canMutateRep: boolean) {
  if (payment.rep_cfdi_status !== "stamped") return null;
  let nextStep: string | undefined;
  if (payment.rep_cancellation_status === "pending") {
    nextStep = hasRepColumn
      ? "La cancelación del REP está en proceso. Usa «Consultar estado SAT» y espera su resolución antes de editar."
      : "La cancelación del REP está en proceso. Solicita al responsable de Facturación revisar su estado antes de editar.";
  } else if (!hasRepColumn || !canMutateRep) {
    nextStep = "La cancelación del REP no está disponible desde esta factura. Solicita al responsable de Facturación revisar el caso.";
  }
  return describeBusinessBlock("payment_rep_stamped_locked", nextStep ? { nextStep } : undefined);
}

function getStampRepActionState(
  isPending: boolean,
  retryBlockedPaymentIds: ReadonlySet<string> | undefined,
  paymentId: string,
) {
  const retryBlocked = retryBlockedPaymentIds?.has(paymentId) ?? false;
  return {
    disabled: isPending || retryBlocked,
    title: isPending
      ? "Hay un timbrado de REP en curso"
      : retryBlocked
        ? "No se pudo confirmar el estado del REP. Recarga la página antes de reintentar."
        : "Timbrar complemento de pago",
  };
}

async function downloadRep(paymentId: string, format: CfdiFormat) {
  try {
    await downloadCfdiBlob({ payment_id: paymentId }, format, `REP-${paymentId}.${format}`);
  } catch (err: unknown) {
    notifyError({ error: err, message: "Error al descargar REP" });
  }
}

const BASE_PAYMENT_COLUMNS: ColumnDef<Payment>[] = [
  {
    id: "payment_date", header: "Fecha", accessorKey: "payment_date",
    cell: ({ row }) => <span className="text-sm">{formatDateMty(row.original.payment_date)}</span>,
  },
  {
    id: "payment_method", header: "Método", accessorKey: "payment_method",
    cell: ({ row }) => <span className="text-sm">{getPaymentMethodLabel(row.original.payment_method)}</span>,
  },
  {
    id: "reference_number", header: "Referencia", accessorKey: "reference_number",
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reference_number || "—"}</span>,
  },
  {
    id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { kind: "number" },
    cell: ({ row }) => {
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

/**
 * Construye columnas de la tabla de pagos + estado de edición.
 * Aísla la lógica de las acciones REP (timbrar/cancelar/descargar).
 */
export function usePaymentHistoryColumns(ppdStamped: boolean, allowRepMutations: boolean = ppdStamped) {
  const canWrite = useHasModuleAccess("Facturas", "full");
  const canMutateRep = canWrite && allowRepMutations;
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [cancelRepPaymentId, setCancelRepPaymentId] = useState<string | null>(null);
  const stampRep = useStampPaymentComplement();
  const refreshRepCancel = useRefreshRepCancellationStatus();

  const isStampPending = stampRep.isPending;
  const stampVariables = stampRep.variables;
  const retryBlockedPaymentIds = stampRep.retryBlockedPaymentIds;
  const isRefreshPending = refreshRepCancel.isPending;

  const stampMutateRef = useRef(stampRep.mutate);
  const refreshMutateRef = useRef(refreshRepCancel.mutate);
  useEffect(() => {
    stampMutateRef.current = stampRep.mutate;
    refreshMutateRef.current = refreshRepCancel.mutate;
  });

  const handleStampRep = useCallback((paymentId: string) => {
    stampMutateRef.current(paymentId);
  }, []);
  const handleRefreshRepCancel = useCallback((paymentId: string) => {
    refreshMutateRef.current(paymentId);
  }, []);

  const columns = useMemo<ColumnDef<Payment>[]>(() => {
    const cols: ColumnDef<Payment>[] = [...BASE_PAYMENT_COLUMNS];

    if (ppdStamped) {
      cols.push({
        id: "rep_status", header: "REP", enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const status = (p.rep_cfdi_status as string | null) ?? "none";
          const repNumber = p.rep_number;
          const repCancelPending = (p.rep_cancellation_status as string | null) === "pending";
          const stampAction = getStampRepActionState(isStampPending, retryBlockedPaymentIds, p.id);
          return (
            <div className="flex items-center gap-1.5">
              {repNumber && <span className="font-mono text-xs text-muted-foreground">{repNumber}</span>}
              <RepBadge status={status} />
              {status === "stamped" && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP PDF" aria-label="Descargar REP PDF" onClick={() => downloadRep(p.id, "pdf")}>
                    <DocumentIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP XML" aria-label="Descargar REP XML" onClick={() => downloadRep(p.id, "xml")}>
                    <FileCode2 className="h-3.5 w-3.5" />
                  </Button>
                  {canMutateRep && !repCancelPending && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancelar REP" aria-label="Cancelar REP" onClick={() => setCancelRepPaymentId(p.id)}>
                      <ErrorIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {repCancelPending && (
                    <>
                      <Badge variant="outline" className="border-warning/40 text-warning-text text-3xs">
                        Cancelación REP en proceso
                      </Badge>
                      {canWrite && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Consultar estado SAT" aria-label="Consultar estado SAT" disabled={isRefreshPending} onClick={() => handleRefreshRepCancel(p.id)}>
                          <RefreshIcon className={`h-3.5 w-3.5 ${isRefreshPending ? "animate-spin" : ""}`} />
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
              {canMutateRep && canStampPaymentRep(p) && (
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={stampAction.disabled}
                  title={stampAction.title}
                  onClick={() => { if (!stampAction.disabled) handleStampRep(p.id); }}
                >
                  <StampIcon className="h-3 w-3 mr-1" />
                  {isStampPending && stampVariables === p.id ? "Timbrando…" : "Timbrar REP"}
                </Button>
              )}
            </div>
          );
        },
      });
    }

    if (canWrite) {
      cols.push({
        id: "actions", header: "", enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const block = getEditPaymentBlock(p, ppdStamped, canMutateRep);
          return (
            <BlockedActionButton
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => !block && setEditingPayment(p)}
              aria-label="Editar pago" title={block ? undefined : "Editar pago"}
              block={block} portal
            >
              <EditIcon className="h-3.5 w-3.5" />
            </BlockedActionButton>
          );
        },
      });
    }

    return cols;
  }, [
    ppdStamped,
    canMutateRep,
    canWrite,
    isStampPending,
    stampVariables,
    retryBlockedPaymentIds,
    isRefreshPending,
    handleStampRep,
    handleRefreshRepCancel,
  ]);

  return { columns, canWrite, editingPayment, setEditingPayment, cancelRepPaymentId, setCancelRepPaymentId };
}
