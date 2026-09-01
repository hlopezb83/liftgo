import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { applyVat, resolveVatRatePercent, sumMoney } from "@/lib/money";
import {
  emptyRecurringSelection,
  isLineSelectable,
  recurringPreviewFingerprint,
  reconcileRecurringSelection,
  toggleRecurringGroup,
  toggleRecurringSelection,
  type RecurringSelectionState,
} from "../../lib/recurringSelection";
import { RecurringPreviewBody } from "./RecurringPreviewBody";
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
  onConfirm: (bookingIds: string[], allowStaleRate: boolean) => void;
}

function periodTitle(period: string | null): string {
  if (!period) return "Vista previa";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return "Vista previa";
  return `Vista previa — ${formatMonthLongEs(new Date(y, m - 1, 1))}`;
}

/**
 * M-13 / R9-14: tasa de IVA de la línea como fracción (0.16 por defecto).
 * Usa `resolveVatRatePercent` — el mismo resolutor que la Edge Function de
 * generación — para que null/undefined/NaN caigan en DEFAULT_VAT_RATE_PERCENT
 * y un 0% explícito del cliente se respete (antes `Number(null) === 0` los
 * confundía).
 */
function vatRateFor(line: RecurringPreviewLine): number {
  return resolveVatRatePercent(line.taxRate) / 100;
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
  const eligibleIds = lines.filter(isSelectable).map((l) => l.bookingId);

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

  // Derivaciones puras: React Compiler las memoiza.
  const groupMap = new Map<string, RecurringPreviewLine[]>();
  for (const line of lines) {
    const key = line.customerName ?? "Sin cliente";
    const arr = groupMap.get(key) ?? [];
    arr.push(line);
    groupMap.set(key, arr);
  }
  const groups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));

  // M-13: IVA por línea con la tasa del cliente (customer.tax_rate) en vez de
  // 16% fijo, y acumulación con sumMoney (centavos) — sin drift de centavos.
  const totalSelected = sumMoney(
    lines
      .filter((l) => isSelectable(l) && selected.has(l.bookingId))
      .map((l) => applyVat(l.billedAmount, vatRateFor(l))),
  );

  const toggle = (id: string) => setSelection((prev) => toggleRecurringSelection(prev, id));

  const toggleGroup = (groupLines: RecurringPreviewLine[]) => {
    const groupEligibleIds = groupLines.filter(isSelectable).map((l) => l.bookingId);
    setSelection((prev) => toggleRecurringGroup(prev, groupEligibleIds));
  };

  // R14-I: el edge genera UNA factura por línea (período pendiente). Contar
  // facturas reales para que el botón no mienta ("Generar 1" cuando serán 3).
  const selectedCount = lines.filter((l) => isSelectable(l) && selected.has(l.bookingId)).length;


  return (
    <FormDialog
      isPending={isGenerating}
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title={periodTitle(data?.period ?? null)}
      description={
        <>
          Revisa las facturas recurrentes que se generarán. Desmarca las que quieras excluir.
          <span className="mt-1 block text-xs text-muted-foreground">
            Nota: se crean como <b>borradores</b> con folio interno LiftGo (FAC-XXXX). El{" "}
            <b>UUID SAT</b> y el <b>ID Facturapi</b> se asignan al timbrar cada una, y pueden no coincidir con el orden del folio interno si timbras fuera de secuencia.
          </span>
        </>
      }
    >
      <RecurringPreviewBody
        isLoading={isLoading}
        lines={lines}
        allowStaleRate={allowStaleRate}
        staleCount={staleCount}
        onAllowStaleRateChange={setAllowStaleRate}
        eligibleCount={eligibleIds.length}
        selectedCount={selectedCount}
        totalSelected={totalSelected}
        groups={groups}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
      />

      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isGenerating} />
        <Button
          onClick={() => onConfirm(
            lines.filter((l) => isSelectable(l) && selected.has(l.bookingId)).map((l) => l.bookingId),
            allowStaleRate,
          )}

          disabled={isLoading || isGenerating || selectedCount === 0}
        >
          {isGenerating
            ? "Generando…"
            : `Generar ${selectedCount} factura${selectedCount === 1 ? "" : "s"} · ${formatCurrency(totalSelected)}`}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
