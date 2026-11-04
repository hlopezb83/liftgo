import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { RecurringPreviewBody } from "./RecurringPreviewBody";
import { RecurringScopeControls } from "./RecurringScopeControls";
import { useRecurringPreviewModel } from "./useRecurringPreviewModel";
import type {
  RecurringPreviewResponse,
  RecurringPreviewScope,
} from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RecurringPreviewResponse | undefined;
  isLoading: boolean;
  isGenerating: boolean;
  isError?: boolean;
  onScopeChange?: (scope: RecurringPreviewScope) => void;
  // R9-18: se envían exclusivamente las combinaciones reserva + periodo marcadas.
  onConfirm: (
    selections: Array<{ bookingId: string; periodStart: string; expectedFingerprint?: string }>,
    allowStaleRate: boolean,
    scope: RecurringPreviewScope,
  ) => void;
}

export function RecurringInvoicesPreviewDialog({
  open, onOpenChange, data, isLoading, isGenerating, onConfirm, isError = false, onScopeChange,
}: Props) {
  const model = useRecurringPreviewModel({ open, data, isLoading, isError, onScopeChange });
  const { includeFuturePeriods, scope, validMonth,
    waiting, canConfirm, lines, allowStaleRate, setAllowStaleRate, staleCount, eligibleIds,
    selected, groups, selectedLines, totalsLabel, toggle, toggleGroup, selectedCount } = model;

  return (
    <FormDialog
      isPending={isGenerating}
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title="Generar borradores recurrentes"
      description="Selecciona los períodos de renta. Se crearán borradores sin timbrar."
    >
      <RecurringScopeControls model={model} isGenerating={isGenerating} isLoading={isLoading}
        isError={isError} onScopeChange={onScopeChange} />
      {isError ? (
        <div role="alert" className="mb-4 space-y-2 text-sm">
          <p>No se pudo calcular la vista previa. Vuelve a calcular antes de generar.</p>
          <Button variant="outline" disabled={includeFuturePeriods && !validMonth} onClick={() => onScopeChange?.(scope)}>Reintentar vista previa</Button>
        </div>
      ) : (
      <RecurringPreviewBody
        isLoading={waiting}
        requireFingerprint={includeFuturePeriods}
        lines={lines}
        allowStaleRate={allowStaleRate}
        staleCount={staleCount}
        truncated={data?.truncated === true}
        pendingCount={data?.pending_count ?? 0}
        onAllowStaleRateChange={setAllowStaleRate}
        eligibleCount={eligibleIds.length}
        selectedCount={selectedCount}
        totalsLabel={totalsLabel}
        groups={groups}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
      />
      )}

      <FormDialogFooter className="mt-4">
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isGenerating} />
        <Button
          onClick={() => { if (!canConfirm || isGenerating || selectedCount === 0) return; onConfirm(
            selectedLines.map((l) => ({ bookingId: l.bookingId, periodStart: l.periodStart,
              ...(l.previewFingerprint ? { expectedFingerprint: l.previewFingerprint } : {}) })),
            allowStaleRate,
            scope,
          ); }}

          disabled={!canConfirm || isGenerating || selectedCount === 0}
        >
          {isGenerating
            ? "Generando…"
            : `Generar ${selectedCount} periodo${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
