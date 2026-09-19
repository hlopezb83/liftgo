import { EmptyState } from "@/components/feedback/EmptyState";
import { InvoiceIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";
import {
  AlreadyInvoicedNotice,
  CustomerGroup,
  StaleRateNotice,
  SummaryBar,
} from "./RecurringPreviewParts";

interface Props {
  isLoading: boolean;
  lines: RecurringPreviewLine[];
  /** R6-F5: confirmación para incluir periodos con tarifa posiblemente cambiada. */
  allowStaleRate: boolean;
  staleCount: number;
  onAllowStaleRateChange: (value: boolean) => void;
  eligibleCount: number;
  selectedCount: number;
  totalSelected: number;
  groups: [string, RecurringPreviewLine[]][];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
}

export function RecurringPreviewBody({
  isLoading,
  lines,
  eligibleCount,
  selectedCount,
  totalSelected,
  groups,
  selected,
  onToggle,
  onToggleGroup,
  allowStaleRate,
  staleCount,
  onAllowStaleRateChange,
}: Props) {
  const isSelectable = (l: RecurringPreviewLine) =>
    l.eligible && (!l.rateWarning || allowStaleRate);
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
      <EmptyState
        icon={InvoiceIcon}
        title="Sin facturas pendientes"
        subtitle="No hay reservas con facturación recurrente elegibles este mes."
      />
    );
  }
  const alreadyInvoicedCount = lines.filter((l) => l.reason === "already_invoiced").length;
  return (
    <>
      <SummaryBar eligibleCount={eligibleCount} selectedCount={selectedCount} totalSelected={totalSelected} />
      <div className="mt-3">
        <AlreadyInvoicedNotice
          eligibleCount={eligibleCount}
          alreadyInvoicedCount={alreadyInvoicedCount}
        />
        <StaleRateNotice
          staleCount={staleCount}
          allowStaleRate={allowStaleRate}
          onChange={onAllowStaleRateChange}
        />
      </div>

      {/* v7.307.0: aclarar el alcance — aquí sólo entran rentas mensuales recurrentes. */}
      <p className="text-xs text-muted-foreground">
        Sólo se listan reservas confirmadas con facturación recurrente mensual. Las extensiones de
        rentas cortas se cobran desde el detalle de la reserva, con “Facturar extensión”.
      </p>
      {/* v7.279.3: `ScrollArea` de Radix necesita altura definida; con sólo
          `max-h` su viewport (`h-full`) crecía al alto del contenido y el
          scroll nunca se activaba (contenido recortado). Scroll nativo. */}
      <div className="max-h-[50vh] overflow-y-auto pr-3 mt-3">
        <div className="space-y-4">
          {groups.map(([customer, groupLines]) => (
            <CustomerGroup
              key={customer}
              customer={customer}
              groupLines={groupLines}
              selected={selected}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
              isSelectable={isSelectable}
            />
          ))}
        </div>
      </div>
    </>
  );
}
