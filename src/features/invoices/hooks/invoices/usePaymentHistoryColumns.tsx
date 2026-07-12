import { useState } from "react";
import { type ColumnDef } from "@/components/dataTable/v2";
import { useConfirm } from "@/components/feedback/useConfirm";
import { EditIcon, StampIcon, DocumentIcon, FileCode2, ErrorIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import { formatDateDisplay } from "@/lib/utils";
import { RepBadge } from "../../components/invoice-detail/RepBadge";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";
import { useStampPaymentComplement, useCancelPaymentComplement } from "./cfdi/usePaymentComplement";

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
  const stampRep = useStampPaymentComplement();
  const cancelRep = useCancelPaymentComplement();
  const confirm = useConfirm();

  const columns: ColumnDef<Payment>[] = (() => {
    const base: ColumnDef<Payment>[] = [
      {
        id: "payment_date", header: "Fecha", accessorKey: "payment_date",
        cell: ({ row }) => <span className="text-sm">{formatDateDisplay(row.original.payment_date)}</span>,
      },
      {
        id: "payment_method", header: "Método", accessorKey: "payment_method",
        cell: ({ row }) => <span className="text-sm capitalize">{row.original.payment_method || "—"}</span>,
      },
      {
        id: "reference_number", header: "Referencia", accessorKey: "reference_number",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reference_number || "—"}</span>
        ),
      },
      {
        id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { align: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <ReconciliationBadge paymentId={row.original.id} />
            <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span>
          </div>
        ),
      },
    ];

    if (ppdStamped) {
      base.push({
        id: "rep_status", header: "REP", enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const status = (p.rep_cfdi_status as string | null) ?? "none";
          const repNumber = (p.rep_number as string | null) ?? null;
          return (
            <div className="flex items-center gap-1.5">
              {repNumber && (
                <span className="font-mono text-xs text-muted-foreground">{repNumber}</span>
              )}
              <RepBadge status={status} />
              {status === "stamped" && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP PDF" onClick={() => downloadRep(p.id, "pdf")}>
                    <DocumentIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="REP XML" onClick={() => downloadRep(p.id, "xml")}>
                    <FileCode2 className="h-3.5 w-3.5" />
                  </Button>
                  {allowRepMutations && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      title="Cancelar REP" disabled={cancelRep.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Cancelar Complemento de Pago",
                          description: "¿Cancelar el Complemento de Pago (REP) ante el SAT? El motivo enviado será \"02 · Comprobante emitido con errores sin relación\".",
                          confirmLabel: "Cancelar REP",
                          cancelLabel: "Volver",
                          destructive: true,
                        });
                        if (ok) cancelRep.mutate({ paymentId: p.id, motive: "02" });
                      }}
                    >
                      <ErrorIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
              {allowRepMutations && (status === "none" || status === "error") && (
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={stampRep.isPending}
                  onClick={() => stampRep.mutate(p.id)}
                >
                  <StampIcon className="h-3 w-3 mr-1" /> Timbrar REP
                </Button>
              )}
            </div>
          );
        },
      });
    }

    base.push({
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPayment(row.original)} aria-label="Editar pago" title="Editar pago">
          <EditIcon className="h-3.5 w-3.5" />
        </Button>
      ),
    });

    return base;
  })();

  return { columns, editingPayment, setEditingPayment };
}
