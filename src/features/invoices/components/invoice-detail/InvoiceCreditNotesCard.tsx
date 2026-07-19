import { useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { AddIcon, StampIcon, DocumentIcon, DownloadIcon, ErrorIcon, DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";
import { CREDIT_NOTE_MOTIVE_LABELS as MOTIVE_LABELS } from "@/lib/domain/creditNoteMotives";
import { computeMaxCreditable } from "../../lib/computeMaxCreditable";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import { formatDateDisplay } from "@/lib/utils";
import {
  useCreditNotesForInvoice,
  useStampCreditNote,
  useDeleteCreditNote,
  type CreditNote,
} from "../../hooks/creditNotes/useCreditNotes";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";
import { CancelCreditNoteDialog } from "./CancelCreditNoteDialog";
import { CreateCreditNoteDialog } from "./CreateCreditNoteDialog";


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

interface Props {
  invoice: Tables<"invoices">;
}

export function InvoiceCreditNotesCard({ invoice }: Props) {
  const { data: creditNotes = [] } = useCreditNotesForInvoice(invoice.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CreditNote | null>(null);
  const stampMutation = useStampCreditNote();
  const deleteMutation = useDeleteCreditNote();
  const confirm = useConfirm();

  const activeCredits = creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.cancellation_status !== "accepted" && cn.status !== "cancelled")
    .reduce((s, cn) => s + Number(cn.total), 0);
  const draftCredits = creditNotes
    .filter((cn) => cn.status === "draft")
    .reduce((s, cn) => s + Number(cn.total), 0);

  // BL-08 v7.90.0: los pagos no limitan el crédito (ver computeMaxCreditable).
  const maxCreditable = computeMaxCreditable(Number(invoice.total), activeCredits, draftCredits);
  const canCreate = invoice.cfdi_status === "stamped" && invoice.status !== "cancelled" && maxCreditable > 0;

  if (creditNotes.length === 0 && !canCreate) return null;

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
                    <TableCell className="text-sm">{formatDateDisplay(cn.issued_at)}</TableCell>
                    <TableCell className="text-sm">{MOTIVE_LABELS[cn.motive] ?? cn.motive}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(cn.total))}</TableCell>
                    <TableCell><CnBadge cn={cn} /></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {cn.cfdi_status === "stamped" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="PDF SAT" aria-label="Descargar PDF SAT" onClick={() => downloadCreditNote(cn.id, "pdf", cn.credit_note_number)}>
                              <DocumentIcon className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="XML SAT" aria-label="Descargar XML SAT" onClick={() => downloadCreditNote(cn.id, "xml", cn.credit_note_number)}>
                              <DownloadIcon className="h-3.5 w-3.5" />
                            </Button>
                            {cn.cancellation_status !== "pending" && cn.status !== "cancelled" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancelar NC" aria-label="Cancelar nota de crédito" onClick={() => setCancelTarget(cn)}>
                                <ErrorIcon className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                        {cn.status === "draft" && (
                          <>
                            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={stampMutation.isPending} onClick={() => stampMutation.mutate(cn.id)}>
                              <StampIcon className="h-3 w-3 mr-1" /> Timbrar
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Eliminar borrador" aria-label="Eliminar borrador de nota de crédito" onClick={async () => {
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
