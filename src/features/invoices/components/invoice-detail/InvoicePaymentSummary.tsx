import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Stamp, FileText, Download, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { EditPaymentDialog } from "./EditPaymentDialog";
import type { Tables } from "@/integrations/supabase/types";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { useStampPaymentComplement, useCancelPaymentComplement } from "@/features/invoices/hooks/invoices/usePaymentComplement";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
import { ReconciliationBadge } from "@/features/bank-reconciliation/components/ReconciliationBadge";

interface InvoicePaymentSummaryProps {
  totalPaid: number;
  balance: number;
  payments: Tables<"payments">[];
  /** If true, parent invoice is PPD+stamped (REP capabilities visible) */
  ppdStamped?: boolean;
  creditedAmount?: number;
}

type Payment = Tables<"payments">;

async function downloadRep(paymentId: string, format: "pdf" | "xml") {
  try {
    const { data, error } = await supabase.functions.invoke("download-cfdi", {
      body: { payment_id: paymentId, format },
    });
    if (error) throw error;
    if (data instanceof Blob) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `REP-${paymentId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    notifyError({ error: err, message: "Error al descargar REP" });
  }
}

function RepBadge({ status }: { status: string | null }) {
  const s = status ?? "none";
  if (s === "stamped") return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Timbrado</Badge>;
  if (s === "cancelled") return <Badge variant="destructive">Cancelado</Badge>;
  if (s === "error") return <Badge variant="destructive">Error</Badge>;
  if (s === "pending") return <Badge variant="secondary">Pendiente</Badge>;
  return <Badge variant="outline">Sin REP</Badge>;
}

export function InvoicePaymentSummary({ totalPaid, balance, payments, ppdStamped = false, creditedAmount = 0 }: InvoicePaymentSummaryProps) {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const stampRep = useStampPaymentComplement();
  const cancelRep = useCancelPaymentComplement();

  const columns = useMemo<ColumnDef<Payment>[]>(() => {
    const base: ColumnDef<Payment>[] = [
      {
        id: "payment_date",
        header: "Fecha",
        accessorKey: "payment_date",
        cell: ({ row }) => <span className="text-sm">{formatDateDisplay(row.original.payment_date)}</span>,
      },
      {
        id: "payment_method",
        header: "Método",
        accessorKey: "payment_method",
        cell: ({ row }) => <span className="text-sm capitalize">{row.original.payment_method || "—"}</span>,
      },
      {
        id: "reference_number",
        header: "Referencia",
        accessorKey: "reference_number",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reference_number || "—"}</span>
        ),
      },
      {
        id: "amount",
        header: "Monto",
        accessorFn: (p) => Number(p.amount),
        meta: { align: "right" },
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
        id: "rep_status",
        header: "REP",
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const status = (p.rep_cfdi_status as string | null) ?? "none";
          return (
            <div className="flex items-center gap-1.5">
              <RepBadge status={status} />
              {status === "stamped" && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Descargar PDF" onClick={() => downloadRep(p.id, "pdf")}>
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Descargar XML" onClick={() => downloadRep(p.id, "xml")}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="Cancelar REP"
                    disabled={cancelRep.isPending}
                    onClick={() => {
                      if (confirm("¿Cancelar el Complemento de Pago ante el SAT?")) {
                        cancelRep.mutate({ paymentId: p.id, motive: "02" });
                      }
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {(status === "none" || status === "error") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={stampRep.isPending}
                  onClick={() => stampRep.mutate(p.id)}
                >
                  <Stamp className="h-3 w-3 mr-1" /> Timbrar REP
                </Button>
              )}
            </div>
          );
        },
      });
    }

    base.push({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPayment(row.original)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    });

    return base;
  }, [ppdStamped, stampRep, cancelRep]);

  const table = useLiftgoTable<Payment>({
    data: payments,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "payment_date", desc: true }],
    paginated: false,
  });

  const pendingReps = ppdStamped
    ? payments.filter((p) => {
        const s = (p.rep_cfdi_status as string | null) ?? "none";
        return s === "none" || s === "error";
      }).length
    : 0;

  return (
    <>
      {(totalPaid > 0 || creditedAmount > 0) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pagado</p>
                <p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              {creditedAmount > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Notas de Crédito</p>
                  <p className="text-lg font-mono font-bold text-blue-600">−{formatCurrency(creditedAmount)}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                <p className={`text-lg font-mono font-bold ${balance <= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(balance)}</p>
              </div>
            </div>
            {pendingReps > 0 && (
              <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ {pendingReps} {pendingReps === 1 ? "pago" : "pagos"} sin Complemento de Pago (REP) timbrado.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTableV2 table={table} emptyMessage="Sin pagos registrados" />
          </CardContent>
        </Card>
      )}

      {editingPayment && (
        <EditPaymentDialog
          open={!!editingPayment}
          onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
          payment={editingPayment}
        />
      )}
    </>
  );
}
