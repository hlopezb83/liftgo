import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Stamp, FileText, Download, XCircle, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { notifyError } from "@/lib/ui/appFeedback";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";
import { CreateCreditNoteDialog } from "./CreateCreditNoteDialog";
import { CancelCreditNoteDialog } from "./CancelCreditNoteDialog";
import {
  useCreditNotesForInvoice,
  useStampCreditNote,
  useDeleteCreditNote,
  type CreditNote,
} from "../../hooks/creditNotes/useCreditNotes";
import type { Tables } from "@/integrations/supabase/types";

import { CREDIT_NOTE_MOTIVE_LABELS as MOTIVE_LABELS } from "@/lib/domain/creditNoteMotives";

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
  totalPaid: number;
}

export function InvoiceCreditNotesCard({ invoice, totalPaid }: Props) {
  const { data: creditNotes = [] } = useCreditNotesForInvoice(invoice.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CreditNote | null>(null);
  const stampMutation = useStampCreditNote();
  const deleteMutation = useDeleteCreditNote();

  const activeCredits = creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.cancellation_status !== "accepted" && cn.status !== "cancelled")
    .reduce((s, cn) => s + Number(cn.total), 0);
  const draftCredits = creditNotes
    .filter((cn) => cn.status === "draft")
    .reduce((s, cn) => s + Number(cn.total), 0);

  const maxCreditable = Number(invoice.total) - totalPaid - activeCredits - draftCredits;
  const canCreate = invoice.cfdi_status === "stamped" && invoice.status !== "cancelled" && maxCreditable > 0;

  if (creditNotes.length === 0 && !canCreate) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Notas de Crédito</CardTitle>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nueva NC
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="PDF SAT" onClick={() => downloadCreditNote(cn.id, "pdf", cn.credit_note_number)}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="XML SAT" onClick={() => downloadCreditNote(cn.id, "xml", cn.credit_note_number)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            {cn.cancellation_status !== "pending" && cn.status !== "cancelled" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancelar NC" onClick={() => setCancelTarget(cn)}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                        {cn.status === "draft" && (
                          <>
                            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={stampMutation.isPending} onClick={() => stampMutation.mutate(cn.id)}>
                              <Stamp className="h-3 w-3 mr-1" /> Timbrar
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Eliminar borrador" onClick={() => {
                              if (confirm("¿Eliminar borrador?")) deleteMutation.mutate(cn.id);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
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
