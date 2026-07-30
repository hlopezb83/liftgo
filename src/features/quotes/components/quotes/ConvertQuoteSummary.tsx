import { InfoRow } from "@/components/forms/InfoRow";
import type { Tables } from "@/integrations/supabase/types";
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
 * Resumen previo a convertir una cotización en reserva(s).
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
      ? `${durationDays} día(s)${months >= 1 ? ` · ~${months} mes(es)` : ""}`
      : "—";

  return (
    <div className="rounded-md border bg-muted/30 divide-y">
      <div className="px-3">
        <InfoRow label="Cliente" value={quote.customer_name || "—"} />
      </div>
      <div className="px-3">
        <InfoRow label="Periodo" value={periodo} />
      </div>
      <div className="px-3">
        <InfoRow label="Duración" value={duracion} />
      </div>
      <div className="px-3">
        <InfoRow label="Reservas a crear" value={`${unitCount} unidad(es)`} />
      </div>
      <div className="px-3">
        <InfoRow label="Total cotizado" value={formatCurrencyWithCode(quote.total ?? 0, quote.currency ?? "MXN")} />
      </div>
    </div>
  );
}
