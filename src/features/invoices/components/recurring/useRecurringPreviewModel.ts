import { useCallback, useMemo, useState } from "react";
import {
  emptyRecurringSelection,
  enforceConsecutiveFutureSelection,
  isLineSelectable,
  recurringLineKey,
  recurringPreviewFingerprint,
  reconcileRecurringSelection,
  toggleRecurringGroup,
  toggleRecurringSelection,
  type RecurringSelectionState,
} from "../../lib/recurringSelection";
import { buildCustomerGroups, rentalTotalsLabel } from "./recurringPreviewPresentation";
import type { RecurringPreviewLine, RecurringPreviewResponse, RecurringPreviewScope } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

interface ModelProps {
  open: boolean;
  data?: RecurringPreviewResponse;
  isLoading: boolean;
  isError: boolean;
  onScopeChange?: (scope: RecurringPreviewScope) => void;
}

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value ?? ""}-${parts.find((part) => part.type === "month")?.value ?? ""}`;
}

function visiblePreviewLines(data: RecurringPreviewResponse | undefined, includeFuturePeriods: boolean) {
  return (data?.lines ?? []).filter((line) => line.reason !== "already_invoiced" && line.reason !== "booking_ended"
    && line.reason !== "period_in_future" && (includeFuturePeriods || !line.isFuture));
}

function previewReadiness(props: ModelProps, scope: RecurringPreviewScope, validMonth: boolean) {
  const scopeMatches = !props.onScopeChange || (props.data?.scope?.includeFuturePeriods === scope.includeFuturePeriods
    && (!scope.includeFuturePeriods || props.data?.scope?.futureThroughMonth === scope.futureThroughMonth));
  const waiting = props.isLoading || (!props.isError && !scopeMatches);
  const canConfirm = !waiting && !props.isError && scopeMatches && (!scope.includeFuturePeriods || validMonth);
  return { waiting, canConfirm };
}

export function useRecurringPreviewModel({ open, data, isLoading, isError, onScopeChange }: ModelProps) {
  const minMonth = currentMonth();
  const [year, month] = minMonth.split("-").map(Number);
  const nextMonth = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;
  const maxMonth = `${Number(minMonth.slice(0, 4)) + 2}${minMonth.slice(4)}`;
  const [includeFuturePeriods, setIncludeFuturePeriods] = useState(false);
  const [futureThroughMonth, setFutureThroughMonth] = useState(nextMonth);
  const scope: RecurringPreviewScope = { includeFuturePeriods, ...(includeFuturePeriods ? { futureThroughMonth } : {}) };
  const validMonth = /^\d{4}-\d{2}$/.test(futureThroughMonth) && futureThroughMonth >= minMonth && futureThroughMonth <= maxMonth;
  const { waiting, canConfirm } = previewReadiness({ open, data, isLoading, isError, onScopeChange }, scope, validMonth);
  const lines = useMemo(() => visiblePreviewLines(data, includeFuturePeriods), [data, includeFuturePeriods]);
  // R6-F5: los periodos con `rateWarning` (reserva actualizada después del
  // periodo) sólo se pueden facturar con confirmación explícita.
  const [allowStaleRate, setAllowStaleRate] = useState(false);
  const isSelectable = useCallback((l: RecurringPreviewLine) => isLineSelectable(l, allowStaleRate)
    && (!includeFuturePeriods || !!l.previewFingerprint), [allowStaleRate, includeFuturePeriods]);
  const staleCount = useMemo(() => lines.filter((l) => l.eligible && l.rateWarning).length, [lines]);
  // R9-18: la unidad seleccionable es reserva + periodo.
  const eligibleIds = useMemo(() => lines.filter(isSelectable).map(recurringLineKey), [lines, isSelectable]);

  // R8-05 / R8-12: la selección se reconcilia contra las filas actuales del
  // preview con un reducer puro, en vez de reconstruirse desde cero. Así las
  // filas que desaparecen, dejan de ser elegibles o cambian de periodo/monto no
  // quedan seleccionadas en silencio, y lo que el usuario desmarcó no vuelve.
  const [selection, setSelection] = useState<RecurringSelectionState>(() =>
    reconcileRecurringSelection(emptyRecurringSelection(), lines, allowStaleRate),
  );
  const fingerprint = useMemo(() => recurringPreviewFingerprint(lines, allowStaleRate), [lines, allowStaleRate]);
  const [prevFingerprint, setPrevFingerprint] = useState(fingerprint);
  // R9-02: cada apertura del diálogo es una sesión nueva: sin consentimiento de
  // tarifa heredado y con la selección reconstruida desde el preview actual.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setAllowStaleRate(false);
      setIncludeFuturePeriods(false);
      setFutureThroughMonth(nextMonth);
      setSelection(emptyRecurringSelection());
      setPrevFingerprint("");
    }
  } else if (prevFingerprint !== fingerprint) {
    // Patrón React "adjust state during render" (sin useEffect ni render extra).
    setPrevFingerprint(fingerprint);
    setSelection((prev) => enforceConsecutiveFutureSelection(reconcileRecurringSelection(prev, lines, allowStaleRate), lines));
  }

  const selected = selection.selected as Set<string>;

  const groups = useMemo(() => buildCustomerGroups(lines.filter((line) => line.eligible)), [lines]);

  const selectedLines = lines.filter((l) => isSelectable(l) && selected.has(recurringLineKey(l)));
  const totalsLabel = rentalTotalsLabel(selectedLines);

  const toggle = useCallback((id: string) => setSelection((prev) => enforceConsecutiveFutureSelection(toggleRecurringSelection(prev, id), lines)), [lines]);

  const toggleGroup = (groupLines: RecurringPreviewLine[]) => {
    const groupEligibleIds = groupLines.filter(isSelectable).map(recurringLineKey);
    setSelection((prev) => enforceConsecutiveFutureSelection(toggleRecurringGroup(prev, groupEligibleIds), lines));
  };

  const changeScope = (include: boolean, month: string) => {
    setIncludeFuturePeriods(include);
    setFutureThroughMonth(month);
    // A new horizon requires fresh consent; do not retain hidden future intent.
    setSelection(emptyRecurringSelection());
    setPrevFingerprint("");
    if (!include || (/^\d{4}-\d{2}$/.test(month) && month >= minMonth && month <= maxMonth)) {
      onScopeChange?.({ includeFuturePeriods: include, ...(include ? { futureThroughMonth: month } : {}) });
    }
  };

  // El servidor puede agrupar varias reservas del mismo cliente, periodo,
  // divisa y tipo de cambio en una factura. Contamos periodos seleccionados,
  // no prometemos un número de facturas que la vista previa no conoce.
  const selectedCount = selectedLines.length;

  return { minMonth, maxMonth, includeFuturePeriods, futureThroughMonth, scope, validMonth,
    waiting, canConfirm, lines, allowStaleRate, setAllowStaleRate, staleCount, eligibleIds,
    selected, groups, selectedLines, totalsLabel, toggle, toggleGroup, changeScope, selectedCount };
}
