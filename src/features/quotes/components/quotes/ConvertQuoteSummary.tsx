import { InfoRow } from "@/components/forms/InfoRow";
import type { Tables } from "@/integrations/supabase/types";
import { countLabel } from "@/lib/format/countLabel";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface Props {
  quote: Tables<"quotes">;
  /** Días de renta calculados en el detalle de la cotización. */
  durationDays: number;
  /** Cuántas reservas se crearán (una por unidad). */
  unitCount: number;
}

/**
 * Resumen previo a convertir una cotización en reservas.
 * Contesta las cuatro preguntas que el usuario tenía que adivinar antes:
 * a qué cliente, en qué periodo, cuántas reservas y por cuánto.
 */
export function ConvertQuoteSummary({ quote, durationDays, unitCount }: Props) {
  const months = durationDays > 0 ? Math.floor(durationDays / 30) : 0;
  const periodo =
    quote.start_date && quote.end_date
      ? `${formatDateMty(quote.start_date)} → ${formatDateMty(quote.end_date)}`
      : "Sin fechas definidas";
  const duracion =
    durationDays > 0
      ? `${countLabel(durationDays, "día", "días")}${months >= 1 ? ` · ~${countLabel(months, "mes", "meses")}` : ""}`
      : "—";

  return (
    <div className="rounded-md border bg-muted/30 divide-y">
      <div className="px-3 py-2">
        <InfoRow label="Cliente" value={quote.customer_name || "—"} />
      </div>
      <div className="px-3 py-2">
        <InfoRow label="Periodo" value={periodo} />
      </div>
      <div className="px-3 py-2">
        <InfoRow label="Duración" value={duracion} />
      </div>
      <div className="px-3 py-2">
        <InfoRow label="Reservas a crear" value={countLabel(unitCount, "unidad", "unidades")} />
      </div>
      <div className="px-3 py-2">
        <InfoRow label="Total cotizado" value={formatCurrencyWithCode(quote.total ?? 0, quote.currency ?? "MXN")} />
      </div>
    </div>
  );
}
