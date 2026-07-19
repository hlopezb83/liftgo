import { Link } from "react-router";
import { EmptyState } from "@/components/feedback/EmptyState";
import { InfoAlertIcon, InvoiceIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

const REASON_LABEL: Record<NonNullable<RecurringPreviewLine["reason"]>, string> = {
  already_invoiced: "Ya facturada",
  no_customer: "Sin cliente asignado",
  no_monthly_rate: "Sin tarifa mensual",
  period_in_future: "Período futuro",
  period_too_old: "Período atrasado — requiere revisión",
};

interface Props {
  isLoading: boolean;
  lines: RecurringPreviewLine[];
  eligibleCount: number;
  selectedCount: number;
  totalSelected: number;
  groups: [string, RecurringPreviewLine[]][];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
}

function SummaryBar({
  eligibleCount,
  selectedCount,
  totalSelected,
}: {
  eligibleCount: number;
  selectedCount: number;
  totalSelected: number;
}) {
  return (
    <div className="flex items-center gap-4 text-sm border rounded-md p-3 bg-muted/30">
      <div>
        <span className="text-muted-foreground">Elegibles: </span>
        <span className="font-semibold">{eligibleCount}</span>
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
  );
}

function IneligibleBadge({ line }: { line: RecurringPreviewLine }) {
  const isAlreadyInvoiced = line.reason === "already_invoiced" && line.existingInvoiceId;
  return (
    <Badge variant="secondary" className="gap-1">
      <InfoAlertIcon className="h-3 w-3" />
      {isAlreadyInvoiced ? (
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
  );
}

function LineRow({
  line,
  selected,
  onToggle,
}: {
  line: RecurringPreviewLine;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <Checkbox
        checked={line.eligible && selected.has(line.bookingId)}
        disabled={!line.eligible}
        onCheckedChange={() => line.eligible && onToggle(line.bookingId)}
        aria-label={`Facturar ${line.bookingCode ?? line.bookingId}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">
            {line.bookingCode ?? line.bookingId.slice(0, 8)}
          </span>
          {line.forkliftName ? (
            <span className="text-muted-foreground truncate">— {line.forkliftName}</span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {line.periodLabel}
          {line.isProrated ? (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · prorrateado {line.proratedDays} días
            </span>
          ) : null}
        </div>
      </div>
      {line.eligible ? (
        <span className="font-mono text-sm">{formatCurrency(line.billedAmount)}</span>
      ) : (
        <IneligibleBadge line={line} />
      )}
    </div>
  );
}

function CustomerGroup({
  customer,
  groupLines,
  selected,
  onToggle,
  onToggleGroup,
}: {
  customer: string;
  groupLines: RecurringPreviewLine[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
}) {
  const groupEligible = groupLines.filter((l) => l.eligible);
  const allSelected = groupEligible.length > 0 && groupEligible.every((l) => selected.has(l.bookingId));
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        {groupEligible.length > 0 ? (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleGroup(groupLines)}
            aria-label={`Seleccionar todas de ${customer}`}
          />
        ) : null}
        <span className="font-semibold text-sm">{customer}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {groupEligible.length} de {groupLines.length} elegibles
        </span>
      </div>
      <div className="divide-y">
        {groupLines.map((line) => (
          <LineRow key={line.bookingId} line={line} selected={selected} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
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
}: Props) {
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
  return (
    <>
      <SummaryBar eligibleCount={eligibleCount} selectedCount={selectedCount} totalSelected={totalSelected} />
      <ScrollArea className="max-h-[50vh] pr-3 mt-3">
        <div className="space-y-4">
          {groups.map(([customer, groupLines]) => (
            <CustomerGroup
              key={customer}
              customer={customer}
              groupLines={groupLines}
              selected={selected}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </div>
      </ScrollArea>
    </>
  );
}
