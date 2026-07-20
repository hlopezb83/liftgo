import { useRef, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { applyVat } from "@/lib/money";
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
  onConfirm: (bookingIds: string[]) => void;
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
  // Derivaciones puras (React Compiler memoiza). Nota: `lines`/`eligibleIds`
  // son arrays nuevos en cada render, por lo que la comparación de identidad
  // NO es válida para el patrón "adjust state during render". Usamos una
  // clave string estable derivada de los ids elegibles.
  const lines = data?.lines ?? [];
  const eligibleIds = lines.filter((l) => l.eligible).map((l) => l.bookingId);
  const eligibleKey = eligibleIds.join("|");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleIds));

  // Rehidratar la selección cuando cambia el conjunto de elegibles — patrón
  // React "adjust state during render" en vez de un useEffect que agregaría
  // una render extra. https://react.dev/learn/you-might-not-need-an-effect
  const [prevEligibleKey, setPrevEligibleKey] = useState(eligibleKey);
  if (prevEligibleKey !== eligibleKey) {
    setPrevEligibleKey(eligibleKey);
    setSelected(new Set(eligibleIds));
  }


  // Derivaciones puras: React Compiler las memoiza.
  const groupMap = new Map<string, RecurringPreviewLine[]>();
  for (const line of lines) {
    const key = line.customerName ?? "Sin cliente";
    const arr = groupMap.get(key) ?? [];
    arr.push(line);
    groupMap.set(key, arr);
  }
  const groups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));

  const totalSelected = lines
    .filter((l) => selected.has(l.bookingId))
    .reduce((acc, l) => acc + applyVat(l.billedAmount), 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupLines: RecurringPreviewLine[]) => {
    const groupEligibleIds = groupLines.filter((l) => l.eligible).map((l) => l.bookingId);
    const allSelected = groupEligibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) groupEligibleIds.forEach((id) => next.delete(id));
      else groupEligibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedCount = selected.size;

  return (
    <FormDialog
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
        eligibleCount={eligibleIds.length}
        selectedCount={selectedCount}
        totalSelected={totalSelected}
        groups={groups}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
      />

      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
          Cancelar
        </Button>
        <Button
          onClick={() => onConfirm(Array.from(selected))}
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
