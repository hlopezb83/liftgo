import { Link } from "react-router";
import { EmptyState } from "@/components/feedback/EmptyState";
import { InfoAlertIcon, InvoiceIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

const REASON_LABEL: Record<NonNullable<RecurringPreviewLine["reason"]>, string> = {
  already_invoiced: "Ya facturada",
  no_customer: "Sin cliente asignado",
  no_monthly_rate: "Sin tarifa mensual",
  period_in_future: "Período futuro",
  booking_ended: "Reserva terminada — completa la devolución",
};

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
        <span className="tabular-nums font-bold">{formatCurrency(totalSelected)}</span>
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

/** R6-F5: aviso de tarifa modificada después del periodo. */
function StaleRateNotice({
  staleCount,
  allowStaleRate,
  onChange,
}: {
  staleCount: number;
  allowStaleRate: boolean;
  onChange: (value: boolean) => void;
}) {
  if (staleCount === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <Checkbox
        checked={allowStaleRate}
        onCheckedChange={(v) => onChange(v === true)}
        aria-label="Confirmar facturación de periodos con tarifa modificada"
        className="mt-0.5"
      />
      <div>
        <p className="font-medium">
          {staleCount} periodo{staleCount === 1 ? "" : "s"} con tarifa modificada después del periodo
        </p>
        <p className="text-xs text-muted-foreground">
          La reserva se editó después de que terminó el periodo, así que la tarifa
          pudo cambiar. No se facturan hasta que confirmes aquí.
        </p>
      </div>
    </div>
  );
}

function LineRow({
  line,
  selected,
  onToggle,
  selectable,
}: {
  line: RecurringPreviewLine;
  selected: Set<string>;
  onToggle: (id: string) => void;
  selectable: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      {/* Selección por reserva: el edge factura todos los períodos pendientes
          de la reserva, por eso alternar una línea alterna toda la reserva. */}
      <Checkbox
        checked={selectable && selected.has(line.bookingId)}
        disabled={!selectable}
        onCheckedChange={() => onToggle(line.bookingId)}
        aria-label={`Incluir la reserva ${line.bookingCode ?? line.bookingId}`}
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
  isSelectable,
}: {
  customer: string;
  groupLines: RecurringPreviewLine[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
  isSelectable: (line: RecurringPreviewLine) => boolean;
}) {
  const groupEligible = groupLines.filter(isSelectable);
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
          <LineRow
            key={`${line.bookingId}:${line.periodStart}`}
            line={line}
            selected={selected}
            onToggle={onToggle}
            selectable={isSelectable(line)}
          />
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
  return (
    <>
      <SummaryBar eligibleCount={eligibleCount} selectedCount={selectedCount} totalSelected={totalSelected} />
      <div className="mt-3">
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
