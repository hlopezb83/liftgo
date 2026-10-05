import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import {
  emptyRecurringSelection,
  isLineSelectable,
  recurringLineKey,
  recurringPreviewFingerprint,
  reconcileRecurringSelection,
  toggleRecurringGroup,
  toggleRecurringSelection,
  type RecurringSelectionState,
} from "../../lib/recurringSelection";
import { RecurringPreviewBody } from "./RecurringPreviewBody";
import { buildCustomerGroups, rentalTotalsLabel } from "./recurringPreviewPresentation";
import type {
  RecurringPreviewLine,
  RecurringPreviewResponse,
} from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RecurringPreviewResponse | undefined;
  isLoading: boolean;
  isGenerating: boolean;
  // R9-18: se envían exclusivamente las combinaciones reserva + periodo marcadas.
  onConfirm: (
    selections: Array<{ bookingId: string; periodStart: string }>,
    allowStaleRate: boolean,
  ) => void;
}

function periodTitle(period: string | null): string {
  if (!period) return "Vista previa";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return "Vista previa";
  return `Vista previa — ${formatMonthLongEs(new Date(y, m - 1, 1))}`;
}

export function RecurringInvoicesPreviewDialog({
  open, onOpenChange, data, isLoading, isGenerating, onConfirm,
}: Props) {
  const lines = data?.lines ?? [];
  // R6-F5: los periodos con `rateWarning` (reserva actualizada después del
  // periodo) sólo se pueden facturar con confirmación explícita.
  const [allowStaleRate, setAllowStaleRate] = useState(false);
  const isSelectable = (l: RecurringPreviewLine) => isLineSelectable(l, allowStaleRate);
  const staleCount = lines.filter((l) => l.eligible && l.rateWarning).length;
  // R9-18: la unidad seleccionable es reserva + periodo.
  const eligibleIds = lines.filter(isSelectable).map(recurringLineKey);

  // R8-05 / R8-12: la selección se reconcilia contra las filas actuales del
  // preview con un reducer puro, en vez de reconstruirse desde cero. Así las
  // filas que desaparecen, dejan de ser elegibles o cambian de periodo/monto no
  // quedan seleccionadas en silencio, y lo que el usuario desmarcó no vuelve.
  const [selection, setSelection] = useState<RecurringSelectionState>(() =>
    reconcileRecurringSelection(emptyRecurringSelection(), lines, allowStaleRate),
  );
  const fingerprint = recurringPreviewFingerprint(lines, allowStaleRate);
  const [prevFingerprint, setPrevFingerprint] = useState(fingerprint);
  // R9-02: cada apertura del diálogo es una sesión nueva: sin consentimiento de
  // tarifa heredado y con la selección reconstruida desde el preview actual.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setAllowStaleRate(false);
      setSelection(emptyRecurringSelection());
      setPrevFingerprint("");
    }
  } else if (prevFingerprint !== fingerprint) {
    // Patrón React "adjust state during render" (sin useEffect ni render extra).
    setPrevFingerprint(fingerprint);
    setSelection((prev) => reconcileRecurringSelection(prev, lines, allowStaleRate));
  }

  const selected = selection.selected as Set<string>;

  const groups = buildCustomerGroups(lines);

  const selectedLines = lines.filter((l) => isSelectable(l) && selected.has(recurringLineKey(l)));
  const totalsLabel = rentalTotalsLabel(selectedLines);

  const toggle = (id: string) => setSelection((prev) => toggleRecurringSelection(prev, id));

  const toggleGroup = (groupLines: RecurringPreviewLine[]) => {
    const groupEligibleIds = groupLines.filter(isSelectable).map(recurringLineKey);
    setSelection((prev) => toggleRecurringGroup(prev, groupEligibleIds));
  };

  // El servidor puede agrupar varias reservas del mismo cliente, periodo,
  // divisa y tipo de cambio en una factura. Contamos periodos seleccionados,
  // no prometemos un número de facturas que la vista previa no conoce.
  const selectedCount = selectedLines.length;


  return (
    <FormDialog
      isPending={isGenerating}
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title={periodTitle(data?.period ?? null)}
      description={
        <>
          Revisa los periodos de renta y selecciona los borradores que quieres generar.
          <span className="mt-1 block text-xs text-muted-foreground">
            Se crean <b>borradores sin timbrar</b> con una referencia interna LiftGo (FAC-XXXX). Al timbrar,{" "}
            <b>Facturapi asigna la serie y el folio</b> y el ERP lo conserva. El UUID SAT se obtiene al completar el timbrado.
          </span>
        </>
      }
    >
      <RecurringPreviewBody
        isLoading={isLoading}
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

      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isGenerating} />
        <Button
          onClick={() => onConfirm(
            selectedLines.map((l) => ({ bookingId: l.bookingId, periodStart: l.periodStart })),
            allowStaleRate,
          )}

          disabled={isLoading || isGenerating || selectedCount === 0}
        >
          {isGenerating
            ? "Generando…"
            : `Generar ${selectedCount} periodo${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
