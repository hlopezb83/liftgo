import { useRef, useState } from "react";
import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/features/users";
import { useQuoteChargeLegacyReview } from "../../hooks/invoices/useQuoteChargeLegacyReview";
import { reviewErrorMessage, type LegacyReviewSelection } from "../../lib/quoteChargeLegacyReview";
import { LegacyReviewForm } from "./LegacyReviewForm";
import { LegacyReviewList } from "./LegacyReviewList";

function ReviewSession({ quoteId, quoteNumber, canAdminister, onClose, restoreFocus }: {
  quoteId: string;
  quoteNumber: string;
  canAdminister: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const query = useQuoteChargeLegacyReview(quoteId, true);
  const [selection, setSelection] = useState<LegacyReviewSelection | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const pending = query.reconcile.isPending || query.reverse.isPending;
  const canWrite = canAdminister && query.data?.can_reconcile === true && !query.isFetching;
  const resetSelection = () => { setSelection(null); setWriteError(null); };

  return (
    <FormDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
      title={selection ? selection.reverse ? "Revertir revisión histórica" : "Conciliar partida histórica" : `Historial de cargos · ${quoteNumber}`}
      description="Revisa la evidencia antes de vincular o clasificar cada partida. La decisión queda auditada y no modifica la factura ni su CFDI. La clasificación solo aplica al alcance de esta cotización."
      width="2xl"
      isPending={pending}
      isDirty={!!selection}
    >
      {query.isPending && <p role="status">Consultando partidas históricas…</p>}
      {query.isError && (
        <div role="alert" className="space-y-3 text-sm">
          <p>{reviewErrorMessage(query.error)}</p>
          <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Reintentar consulta</Button>
        </div>
      )}
      {!query.isError && query.data && (selection ? (
        <LegacyReviewForm
          key={`${selection.invoice.invoice_id}:${selection.line.line_index}:${selection.line.review?.id ?? "new"}`}
          data={query.data}
          selection={selection}
          pending={pending}
          error={writeError}
          onCancel={() => { resetSelection(); void query.refetch(); }}
          onReconcile={async (input) => {
            if (!canAdminister || !query.data?.can_reconcile) return;
            setWriteError(null);
            try { await query.reconcile.mutateAsync(input); resetSelection(); }
            catch (error) { setWriteError(reviewErrorMessage(error)); }
          }}
          onReverse={async (input) => {
            if (!canAdminister || !query.data?.can_reconcile) return;
            setWriteError(null);
            try { await query.reverse.mutateAsync(input); resetSelection(); }
            catch (error) { setWriteError(reviewErrorMessage(error)); }
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-2">
            <p className="text-sm">{query.data.invoices.reduce((count, invoice) => count + invoice.lines.filter((line) => line.pending).length + (invoice.empty_positive ? 1 : 0), 0)} partidas pendientes en este alcance</p>
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>{query.isFetching ? "Actualizando…" : "Actualizar"}</Button>
          </div>
          <LegacyReviewList data={query.data} canWrite={canWrite} onSelect={(item) => { setWriteError(null); setSelection(item); }} />
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Cerrar revisión</Button></div>
        </div>
      ))}
    </FormDialog>
  );
}

/** Role visibility does not replace the RPC's tenant and permission checks. */
export function QuoteChargeLegacyReview({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const { data: role } = useUserRole();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (role !== "admin" && role !== "administrativo" && role !== "auditor") return null;
  return (
    <section aria-label="Revisión histórica de cargos" className="rounded-md border p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Historial de cargos</h2>
        <p className="text-sm text-muted-foreground">Consulta los folios y decisiones que determinan los cargos disponibles.</p>
      </div>
      <Button ref={trigger} type="button" variant="outline" onClick={() => setOpen(true)}>Revisar historial de cargos</Button>
      {open && <ReviewSession quoteId={quoteId} quoteNumber={quoteNumber} canAdminister={role === "admin"} onClose={() => setOpen(false)} restoreFocus={() => trigger.current?.focus()} />}
    </section>
  );
}
