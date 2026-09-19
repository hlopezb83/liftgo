import { useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import {
  useCreditNotesForInvoice,
  useStampCreditNote,
  useDeleteCreditNote,
  type CreditNote,
} from "../../hooks/creditNotes/useCreditNotes";
import { useRefreshCreditNoteCancellationStatus } from "../../hooks/invoices/cfdi/useRefreshCancellationStatus";
import { usePayments } from "../../hooks/usePayments";
import { computeCreditNoteLimits } from "../../lib/creditNoteLimits";
import { CancelCreditNoteDialog } from "./CancelCreditNoteDialog";
import { CreateCreditNoteDialog } from "./CreateCreditNoteDialog";
import { CreditNoteNotices, CreditNotesTable } from "./InvoiceCreditNotesParts";

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
          <CreditNotesTable
            creditNotes={creditNotes}
            stampMutation={stampMutation}
            deleteMutation={deleteMutation}
            refreshCancelMutation={refreshCancelMutation}
            confirm={confirm}
            setCancelTarget={setCancelTarget}
          />
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
