import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { AlertCircle, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import type { RecurringPreviewLine, RecurringPreviewResponse } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

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
};

function periodTitle(period: string | null): string {
  if (!period) return "Vista previa";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return "Vista previa";
  return `Vista previa — ${formatMonthLongEs(new Date(y, m - 1, 1))}`;
}

export function RecurringInvoicesPreviewDialog({ open, onOpenChange, data, isLoading, isGenerating, onConfirm }: Props) {
  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);
  const eligibleIds = useMemo(() => lines.filter((l) => l.eligible).map((l) => l.bookingId), [lines]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync selection with eligible lines whenever data changes
  useEffect(() => {
    setSelected(new Set(eligibleIds));
  }, [eligibleIds]);

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
    () => lines.filter((l) => selected.has(l.bookingId)).reduce((acc, l) => acc + l.monthlyRate * 1.16, 0),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{periodTitle(data?.period ?? null)}</DialogTitle>
          <DialogDescription>
            Revisa las facturas recurrentes que se generarán. Desmarca las que quieras excluir.
            <span className="mt-1 block text-xs text-muted-foreground">
              Nota: se crean como <b>borradores</b> con folio interno LiftGo (FAC-XXXX). El <b>UUID SAT</b> y el <b>ID Facturapi</b> se asignan al timbrar cada una, y pueden no coincidir con el orden del folio interno si timbras fuera de secuencia.
            </span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : lines.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Sin facturas pendientes"
            subtitle="No hay reservas con facturación recurrente elegibles este mes."
          />
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm border rounded-md p-3 bg-muted/30">
              <div>
                <span className="text-muted-foreground">Elegibles: </span>
                <span className="font-semibold">{eligibleIds.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Seleccionadas: </span>
                <span className="font-semibold">{selectedCount}</span>
              </div>
              <div className="ml-auto">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-mono font-bold">{formatCurrency(totalSelected)}</span>
                <span className="text-xs text-muted-foreground ml-1">(IVA incl.)</span>
              </div>
            </div>

            <ScrollArea className="max-h-[50vh] pr-3">
              <div className="space-y-4">
                {groups.map(([customer, groupLines]) => {
                  const groupEligible = groupLines.filter((l) => l.eligible);
                  const allSelected = groupEligible.length > 0 && groupEligible.every((l) => selected.has(l.bookingId));
                  return (
                    <div key={customer} className="border rounded-md overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                        {groupEligible.length > 0 && (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleGroup(groupLines)}
                            aria-label={`Seleccionar todas de ${customer}`}
                          />
                        )}
                        <span className="font-semibold text-sm">{customer}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {groupEligible.length} de {groupLines.length} elegibles
                        </span>
                      </div>
                      <div className="divide-y">
                        {groupLines.map((line) => (
                          <div key={line.bookingId} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <Checkbox
                              checked={line.eligible && selected.has(line.bookingId)}
                              disabled={!line.eligible}
                              onCheckedChange={() => line.eligible && toggle(line.bookingId)}
                              aria-label={`Facturar ${line.bookingCode ?? line.bookingId}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs">{line.bookingCode ?? line.bookingId.slice(0, 8)}</span>
                                {line.forkliftName && (
                                  <span className="text-muted-foreground truncate">— {line.forkliftName}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{line.periodLabel}</div>
                            </div>
                            {line.eligible ? (
                              <span className="font-mono text-sm">{formatCurrency(line.monthlyRate)}</span>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {line.reason === "already_invoiced" && line.existingInvoiceId ? (
                                  <Link
                                    to={`/invoices/${line.existingInvoiceId}`}
                                    className="underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {line.existingInvoiceNumber ?? "Ya facturada"}
                                  </Link>
                                ) : (
                                  REASON_LABEL[line.reason ?? "no_customer"]
                                )}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
