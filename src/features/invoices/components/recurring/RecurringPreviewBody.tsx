import { EmptyState } from "@/components/feedback/EmptyState";
import { InvoiceIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CustomerGroup,
  StaleRateNotice,
  SummaryBar,
} from "./RecurringPreviewParts";
import { buildCustomerGroups, type RecurringCustomerGroup } from "./recurringPreviewPresentation";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

interface Props {
  isLoading: boolean;
  requireFingerprint?: boolean;
  lines: RecurringPreviewLine[];
  /** R6-F5: confirmación para incluir periodos con tarifa posiblemente cambiada. */
  allowStaleRate: boolean;
  staleCount: number;
  onAllowStaleRateChange: (value: boolean) => void;
  eligibleCount: number;
  selectedCount: number;
  totalsLabel: string;
  groups: RecurringCustomerGroup[];
  truncated: boolean;
  pendingCount: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
}

export function RecurringPreviewBody({
  isLoading,
  requireFingerprint = false,
  lines,
  eligibleCount,
  selectedCount,
  totalsLabel,
  groups,
  truncated,
  pendingCount,
  selected,
  onToggle,
  onToggleGroup,
  allowStaleRate,
  staleCount,
  onAllowStaleRateChange,
}: Props) {
  const isSelectable = (l: RecurringPreviewLine) =>
    l.eligible && (!l.rateWarning || allowStaleRate) && (!requireFingerprint || !!l.previewFingerprint);
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <>
      <SummaryBar eligibleCount={0} selectedCount={0} totalsLabel={totalsLabel} />
      <EmptyState
        icon={InvoiceIcon}
        title="Sin períodos disponibles"
        subtitle="No hay períodos pendientes en este alcance. Puedes incluir períodos futuros para adelantar una renta."
      />
      </>
    );
  }
  const blockedGroups = buildCustomerGroups(lines.filter((line) => !line.eligible));
  return (
    <>
      {requireFingerprint && lines.some((line) => line.eligible && !line.previewFingerprint) && (
        <p role="alert" className="mb-3 text-sm">Esta vista previa no permite verificar anticipos. Actualiza la aplicación y vuelve a calcular antes de generar.</p>
      )}
      <SummaryBar eligibleCount={eligibleCount} selectedCount={selectedCount} totalsLabel={totalsLabel} />
      <div className="mt-3">
        {truncated && (
          <div role="status" className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">Vista previa parcial</p>
            <p className="text-xs text-muted-foreground">
              Hay periodos adicionales fuera de este lote{pendingCount > 0 ? ` (aproximadamente ${pendingCount})` : ""}.
              No se generarán al confirmar; vuelve a calcular después de revisar los visibles.
            </p>
          </div>
        )}
        <StaleRateNotice
          staleCount={staleCount}
          allowStaleRate={allowStaleRate}
          onChange={onAllowStaleRateChange}
        />
      </div>

      <div className="mt-3">
        <div className="space-y-4">
          {groups.map(({ key, customer, lines: groupLines }) => (
            <CustomerGroup
              key={key}
              customer={customer}
              groupLines={groupLines}
              allLines={lines}
              selected={selected}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
              isSelectable={isSelectable}
            />
          ))}
        </div>
        {blockedGroups.length > 0 && (
          <section aria-label="Períodos que requieren revisión" className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold">Requieren revisión</h3>
            {blockedGroups.map(({ key, customer, lines: groupLines }) => (
              <CustomerGroup key={key} customer={customer} groupLines={groupLines} allLines={lines}
                selected={selected} onToggle={onToggle} onToggleGroup={onToggleGroup}
                isSelectable={() => false} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
