import { useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { AddIcon, StampIcon, DocumentIcon, DownloadIcon, ErrorIcon, DeleteIcon, RefreshIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CREDIT_NOTE_MOTIVE_LABELS as MOTIVE_LABELS } from "@/features/invoices/lib/creditNoteMotives";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  useCreditNotesForInvoice,
  useStampCreditNote,
  useDeleteCreditNote,
  type CreditNote,
} from "../../hooks/creditNotes/useCreditNotes";
import { useRefreshCreditNoteCancellationStatus } from "../../hooks/invoices/cfdi/useRefreshCancellationStatus";
import { usePayments } from "../../hooks/usePayments";
import { computeCreditNoteLimits } from "../../lib/creditNoteLimits";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";
import { CancelCreditNoteDialog } from "./CancelCreditNoteDialog";
import { CreateCreditNoteDialog } from "./CreateCreditNoteDialog";
import { CreditNoteRepLimitNotice } from "./CreditNoteRepLimitNotice";


async function downloadCreditNote(creditNoteId: string, format: CfdiFormat, number: string) {
  try {
    await downloadCfdiBlob({ credit_note_id: creditNoteId }, format, `${number}.${format}`);
  } catch (err: unknown) {
    notifyError({ error: err, message: "Error al descargar" });
  }
}

function CnBadge({ cn }: { cn: CreditNote }) {
  if (cn.cfdi_status === "stamped") {
    if (cn.cancellation_status === "pending") {
      return <Badge variant="outline" className="border-warning/30 text-warning">Cancel. pendiente</Badge>;
    }
    return <Badge className="bg-success text-success-foreground hover:bg-success/90">Timbrada</Badge>;
  }
  if (cn.cfdi_status === "cancelled") return <Badge variant="destructive">Cancelada</Badge>;
  if (cn.cfdi_status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">Borrador</Badge>;
}

interface NoticeProps {
  blockedByMissingFx: boolean;
  fxMissingReps: number;
  repBacked: number;
  invoiceTotal: number;
  priorCredits: number;
  maxCreditable: number;
  repPayments: number;
  blockedByReps: boolean;
  willCreateCredit: boolean;
  otherPaid: number;
}

function CreditNoteNotices({
  blockedByMissingFx, fxMissingReps, repBacked, invoiceTotal,
  priorCredits, maxCreditable, repPayments, blockedByReps, willCreateCredit, otherPaid,
}: NoticeProps) {
  return (
    <>
      {blockedByMissingFx && (
        <div className="mx-6 mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">No se puede emitir una nota de crédito</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Esta factura tiene {fxMissingReps} complemento(s) de pago timbrado(s) en una moneda distinta a la
            de la factura, sin tipo de cambio capturado. Sin ese dato no se puede calcular el máximo
            acreditable. Captura el tipo de cambio del pago y vuelve a intentarlo.
          </p>
        </div>
      )}
      {repBacked > 0.005 && (
        <CreditNoteRepLimitNotice
          invoiceTotal={invoiceTotal}
          priorCredits={priorCredits}
          repBacked={repBacked}
          maxCreditable={maxCreditable}
          repPayments={repPayments}
          blocked={blockedByReps}
        />
      )}
      {willCreateCredit && (
        <p className="mx-6 mb-4 text-xs text-muted-foreground">
          Esta factura tiene {formatCurrency(otherPaid)} cobrados sin complemento de pago vigente. Una nota de
          crédito por ese importe dejará saldo a favor del cliente, aplicable a facturas futuras.
        </p>
      )}
    </>
  );
}

interface ActionsProps {
  cn: CreditNote;
  stampMutation: ReturnType<typeof useStampCreditNote>;
  deleteMutation: ReturnType<typeof useDeleteCreditNote>;
  refreshCancelMutation: ReturnType<typeof useRefreshCreditNoteCancellationStatus>;
  confirm: ReturnType<typeof useConfirm>;
  setCancelTarget: (cn: CreditNote | null) => void;
}

function CreditNoteActions({ cn, stampMutation, deleteMutation, refreshCancelMutation, confirm, setCancelTarget }: ActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {cn.cfdi_status === "stamped" && (
        <>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="PDF SAT" aria-label="Descargar PDF SAT" onClick={() => downloadCreditNote(cn.id, "pdf", cn.credit_note_number)}>
            <DocumentIcon className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="XML SAT" aria-label="Descargar XML SAT" onClick={() => downloadCreditNote(cn.id, "xml", cn.credit_note_number)}>
            <DownloadIcon className="h-3.5 w-3.5" />
          </Button>
          {cn.cancellation_status === "pending" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Actualizar estado SAT"
              aria-label="Actualizar estado SAT de nota de crédito"
              disabled={refreshCancelMutation.isPending}
              onClick={() => refreshCancelMutation.mutate(cn.id)}
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${refreshCancelMutation.isPending ? "animate-spin" : ""}`} />
            </Button>
          ) : cn.status !== "cancelled" ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancelar NC" aria-label="Cancelar nota de crédito" onClick={() => setCancelTarget(cn)}>
              <ErrorIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </>
      )}
      {cn.status === "draft" && (
        <>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={stampMutation.isPending} onClick={() => stampMutation.mutate(cn.id)}>
            <StampIcon className="h-3 w-3 mr-1" /> Timbrar
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Eliminar borrador" aria-label="Eliminar borrador de nota de crédito" disabled={deleteMutation.isPending} onClick={async () => {
            const ok = await confirm({
              title: "Eliminar borrador",
              description: "¿Eliminar el borrador de la nota de crédito? Esta acción no se puede deshacer.",
              confirmLabel: "Eliminar",
              destructive: true,
            });
            if (ok) deleteMutation.mutate(cn.id);
          }}>
            <DeleteIcon className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

interface Props {
  invoice: Tables<"invoices">;
}

export function InvoiceCreditNotesCard({ invoice }: Props) {
  const { data: creditNotes = [] } = useCreditNotesForInvoice(invoice.id);
  const { data: payments = [] } = usePayments(invoice.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CreditNote | null>(null);
  const stampMutation = useStampCreditNote();
  const deleteMutation = useDeleteCreditNote();
  const refreshCancelMutation = useRefreshCreditNoteCancellationStatus();
  const confirm = useConfirm();

  const {
    activeCredits, draftCredits, repBacked, repPayments, otherPaid,
    maxCreditable, blockedByReps, willCreateCredit, fxMissingReps, blockedByMissingFx,
  } = computeCreditNoteLimits(Number(invoice.total), creditNotes, payments, {
    moneda: invoice.moneda,
    tipo_cambio: invoice.tipo_cambio,
  });

  // FIX-1 (ronda 2): sin tipo de cambio el tope es incalculable → fail-closed.
  const canCreate =
    invoice.cfdi_status === "stamped" &&
    invoice.status !== "cancelled" &&
    maxCreditable > 0.005 &&
    !blockedByMissingFx;

  if (creditNotes.length === 0 && !canCreate && !blockedByReps && !blockedByMissingFx) return null;


  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Notas de Crédito</CardTitle>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <AddIcon className="h-4 w-4 mr-1" /> Nueva NC
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <CreditNoteNotices
            blockedByMissingFx={blockedByMissingFx}
            fxMissingReps={fxMissingReps}
            repBacked={repBacked}
            invoiceTotal={Number(invoice.total)}
            priorCredits={activeCredits + draftCredits}
            maxCreditable={maxCreditable}
            repPayments={repPayments}
            blockedByReps={blockedByReps}
            willCreateCredit={willCreateCredit}
            otherPaid={otherPaid}
          />
          {creditNotes.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">Sin notas de crédito emitidas.</p>
          ) : (
            <Table>

              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((cn) => (
                  <TableRow key={cn.id}>
                    <TableCell className="font-mono text-xs">{cn.credit_note_number}</TableCell>
                    <TableCell className="text-sm">{formatDateMty(cn.issued_at)}</TableCell>
                    <TableCell className="text-sm">{MOTIVE_LABELS[cn.motive] ?? cn.motive}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(cn.total))}</TableCell>
                    <TableCell><CnBadge cn={cn} /></TableCell>
                    <TableCell>
                      <CreditNoteActions
                        cn={cn}
                        stampMutation={stampMutation}
                        deleteMutation={deleteMutation}
                        refreshCancelMutation={refreshCancelMutation}
                        confirm={confirm}
                        setCancelTarget={setCancelTarget}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateCreditNoteDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          invoice={invoice}
          maxCreditable={maxCreditable}
          repBacked={repBacked}
        />

      )}

      {cancelTarget && (
        <CancelCreditNoteDialog
          open={!!cancelTarget}
          onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
          creditNote={cancelTarget}
        />
      )}
    </>
  );
}
