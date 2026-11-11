import { memo } from "react";
import { InfoAlertIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { Link } from "@/lib/router-compat-ui";
import { recurringLineKey } from "../../lib/recurringSelection";
import { recurringCurrency } from "./recurringPreviewPresentation";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

export function SummaryBar({
  eligibleCount,
  selectedCount,
  totalsLabel,
}: {
  eligibleCount: number;
  selectedCount: number;
  totalsLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm border rounded-md p-3 bg-muted/30">
      <div>
        <span className="text-muted-foreground">Períodos disponibles: </span>
        <span className="font-semibold">{eligibleCount}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Seleccionados: </span>
        <span className="font-semibold">{selectedCount}</span>
      </div>
      <div className="w-full sm:ml-auto sm:w-auto">
        <span className="text-muted-foreground">Renta + IVA: </span>
        <span className="tabular-nums font-bold">{totalsLabel}</span>
        <span className="block text-xs text-muted-foreground">IVA incluido; extras pactados pueden sumarse al borrador.</span>
      </div>
    </div>
  );
}

const REASON_LABEL: Record<NonNullable<RecurringPreviewLine["reason"]>, string> = {
  period_overlap_review: "Cobertura de períodos ambigua — requiere revisión",
  legacy_period_review: "Historial de facturación sin período verificable — requiere revisión",
  already_invoiced: "Ya facturada",
  no_customer: "Sin cliente asignado",
  no_monthly_rate: "Sin tarifa mensual",
  period_in_future: "Período futuro",
  booking_ended: "Reserva terminada — completa la devolución",
  no_exchange_rate: "Tipo de cambio pendiente",
  quote_charge_review: "Cargos de cotización pendientes de verificar o conciliar",
  quote_discount_review: "Descuento pactado — requiere facturación manual revisada",
  quote_source_missing: "No se pudo verificar la cotización de origen",
};

function IneligibleBadge({ line }: { line: RecurringPreviewLine }) {
  const isAlreadyInvoiced = line.reason === "already_invoiced" && line.existingInvoiceId;
  return (
    <Badge variant="secondary" className="max-w-full whitespace-normal gap-1">
      <InfoAlertIcon className="h-3 w-3" />
      {isAlreadyInvoiced ? (
        <Link
          to={`/invoices/${line.existingInvoiceId}`}
          className="underline"
          onClick={(e) => e.stopPropagation()}
        >
          {line.existingInvoiceNumber ?? "Ya facturada"}
        </Link>
      ) : line.reason === "quote_charge_review" && line.quoteId ? (
        <Link to={`/quotes/${line.quoteId}`} className="underline" onClick={(event) => event.stopPropagation()}>
          Revisar historial de cargos en cotización
        </Link>
      ) : (
        REASON_LABEL[line.reason ?? "no_customer"]
      )}
    </Badge>
  );
}

/** R6-F5: aviso de tarifa modificada después del periodo. */
export function StaleRateNotice({
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
    <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
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

const LineRow = memo(function LineRow({
  line,
  selected,
  onToggle,
  selectable,
  orderBlocked = false,
}: {
  line: RecurringPreviewLine;
  selected: boolean;
  onToggle: (id: string) => void;
  selectable: boolean;
  orderBlocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      {/* R9-18: selección por reserva + periodo; cada fila es independiente. */}
      <Checkbox
        checked={selectable && selected}
        disabled={!selectable || orderBlocked}
        onCheckedChange={() => onToggle(recurringLineKey(line))}
        aria-label={`Incluir la reserva ${line.bookingCode ?? line.bookingId} del periodo ${line.periodLabel}`}
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
          {line.isFuture && <Badge variant="outline" className="ml-2 border-warning/50 text-warning-text">Futuro</Badge>}
          {line.isProrated ? (
            <span className="ml-1 text-warning-text">
              · prorrateado {line.proratedDays} días
            </span>
          ) : null}
        </div>
        {orderBlocked && <p className="mt-1 text-xs text-warning-text">Selecciona primero los períodos pendientes anteriores de esta reserva.</p>}
      </div>
      {line.eligible ? (
        <span className="shrink-0 font-mono text-sm">
          {formatCurrencyWithCode(line.billedAmount, recurringCurrency(line))} {recurringCurrency(line)}
        </span>
      ) : (
        <IneligibleBadge line={line} />
      )}
    </div>
  );
});

export function CustomerGroup({
  customer,
  groupLines,
  selected,
  onToggle,
  onToggleGroup,
  isSelectable,
  blocked,
}: {
  customer: string;
  groupLines: RecurringPreviewLine[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (groupLines: RecurringPreviewLine[]) => void;
  isSelectable: (line: RecurringPreviewLine) => boolean;
  blocked: ReadonlySet<string>;
}) {
  const groupEligible = groupLines.filter(isSelectable);
  const allSelected = groupEligible.length > 0
    && groupEligible.every((l) => selected.has(recurringLineKey(l)));
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
          {groupLines.length} período{groupLines.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="divide-y">
        {groupLines.map((line) => (
          <LineRow
            key={`${line.bookingId}:${line.periodStart}`}
            line={line}
            selected={selected.has(recurringLineKey(line))}
            onToggle={onToggle}
            selectable={isSelectable(line)}
            orderBlocked={blocked.has(recurringLineKey(line))}
          />
        ))}
      </div>
    </div>
  );
}
