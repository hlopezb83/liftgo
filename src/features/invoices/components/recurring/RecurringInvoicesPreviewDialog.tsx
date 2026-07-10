import { useEffect, useMemo, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { applyVat } from "@/lib/money";

import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { AlertCircle, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
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

const REASON_LABEL: Record<NonNullable<RecurringPreviewLine["reason"]>, string> = {
  already_invoiced: "Ya facturada",
  no_customer: "Sin cliente asignado",
  no_monthly_rate: "Sin tarifa mensual",
  period_in_future: "Período futuro",
  period_too_old: "Período atrasado — requiere revisión",
};

function periodTitle(period: string | null): string {
  if (!period) return "Vista previa";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return "Vista previa";
  return `Vista previa — ${formatMonthLongEs(new Date(y, m - 1, 1))}`;
}

export function RecurringInvoicesPreviewDialog({
  open, onOpenChange, data, isLoading, isGenerating, onConfirm,
}: Props) {
  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);
  const eligibleIds = useMemo(() => lines.filter((l) => l.eligible).map((l) => l.bookingId), [lines]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { setSelected(new Set(eligibleIds)); }, [eligibleIds]);

  const groups = useMemo(() => {
    const map = new Map<string, RecurringPreviewLine[]>();
    for (const line of lines) {
      const key = line.customerName ?? "Sin cliente";
      const arr = map.get(key) ?? [];
      arr.push(line);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [lines]);

  const totalSelected = useMemo(
    () => lines.filter((l) => selected.has(l.bookingId)).reduce((acc, l) => acc + applyVat(l.monthlyRate), 0),
    [lines, selected],
  );


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
      <PreviewBody
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
