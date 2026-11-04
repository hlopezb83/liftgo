import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";
import { legacyClassifications, originalLineField, type LegacyChargeReview, type LegacyReviewInvoice, type LegacyReviewLine, type LegacyReviewSelection } from "../../lib/quoteChargeLegacyReview";

function ReviewHistory({ line }: { line: LegacyReviewLine }) {
  if (line.history.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer">Historial auditado ({line.history.length})</summary>
      <ul className="space-y-2 mt-2">
        {line.history.map((entry, index) => (
          <li key={String(entry.id ?? index)} className="rounded-md bg-muted p-2">
            <p>{legacyClassifications[entry.classification]} · {formatDateTimeMty(entry.created_at)}</p>
            <p>{String(entry.reason ?? "")} · {String(entry.evidence ?? "")}</p>
            <p className="break-all">Actor: {entry.actor_id}</p>
            {entry.reversed_at ? <p>Revertida · {formatDateTimeMty(String(entry.reversed_at))} · {String(entry.reversal_reason ?? "")} · {String(entry.reversal_evidence ?? "")} · Actor: {entry.reversed_by}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function LineDecision({ data, line }: { data: LegacyChargeReview; line: LegacyReviewLine }) {
  const review = line.review;
  const label = line.pending ? "Pendiente de revisión" : review ? legacyClassifications[review.classification] : "Sin decisión vigente";
  const charge = data.charges.find((item) => item.quote_line_id === review?.quote_line_id);
  return (
    <>
      <Badge variant={line.pending ? "secondary" : "outline"}>{label}</Badge>
      {review && <p className="text-xs">{review.reason} · Evidencia: {review.evidence} · {formatDateTimeMty(review.created_at)}</p>}
      {review?.classification === "charge" && <p className="text-xs">Cargo vinculado: {String(charge?.line.description ?? review.quote_line_id)} · Cantidad conciliada: {review.quantity}</p>}
    </>
  );
}

function ReviewedLine({ data, invoice, line, canWrite, onSelect }: {
  data: LegacyChargeReview;
  invoice: LegacyReviewInvoice;
  line: LegacyReviewLine;
  canWrite: boolean;
  onSelect: (selection: LegacyReviewSelection) => void;
}) {
  const actionable = canWrite && invoice.reviewable && line.reviewable && (line.pending || line.review);
  return (
    <div className="border-t pt-3 space-y-2 text-sm">
      <p>Partida {line.line_index + 1}: {String(originalLineField(line.line, "description") ?? "Sin descripción")}</p>
      <p className="text-xs text-muted-foreground">Cantidad original: {String(originalLineField(line.line, "quantity") ?? "No disponible")} · Precio unitario: {String(originalLineField(line.line, "unit_price") ?? "No disponible")}</p>
      {!line.reviewable && <p className="text-sm text-warning-text">{line.blocked_reason ?? "La partida requiere revisión técnica antes de conciliarse."}</p>}
      <LineDecision data={data} line={line} />
      <ReviewHistory line={line} />
      {actionable && (
        <Button type="button" size="sm" variant="outline" onClick={() => onSelect({ invoice, line, reverse: !!line.review })}>{line.review ? "Revertir revisión" : "Revisar partida"}</Button>
      )}
    </div>
  );
}

export function LegacyReviewList({ data, canWrite, onSelect }: {
  data: LegacyChargeReview;
  canWrite: boolean;
  onSelect: (selection: LegacyReviewSelection) => void;
}) {
  return (
    <div className="space-y-4">
      {!canWrite && <p className="text-sm text-muted-foreground">Consulta de auditoría. Solo un administrador puede guardar o revertir revisiones.</p>}
      {data.charges.length === 0 && <p className="rounded-md border p-3 text-sm">Esta cotización no tiene cargos adicionales; su historial no bloquea la renta. Si se agrega un cargo, se volverá a comprobar la revisión.</p>}
      {data.charges.length > 0 && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <h3 className="font-medium">Disponibilidad de cargos</h3>
          {data.charges.map((charge) => <p key={charge.quote_line_id}>{String(charge.line.description ?? "Cargo")} · Consumido {charge.consumed_quantity} · Disponible {charge.remaining_quantity} de {charge.quoted_quantity}</p>)}
        </div>
      )}
      {data.invoices.length === 0 && <p className="text-sm">No hay partidas históricas pendientes en este alcance.</p>}
      {data.invoices.map((invoice) => (
        <section key={invoice.invoice_id} className="rounded-md border p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link to={`/invoices/${invoice.invoice_id}`} className="font-medium underline">{invoice.invoice_number ?? invoice.invoice_id}</Link>
            <Badge variant="secondary">{invoice.active ? "Reserva consumo" : "Sin consumo vigente"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Estado: {invoice.status ?? "Sin estado"} · CFDI: {invoice.cfdi_status ?? "Sin timbrar"} · Cancelación: {invoice.cancellation_status ?? "Sin solicitud"}</p>
          {!invoice.reviewable && <p className="text-sm text-warning-text">No se puede conciliar esta factura aquí: requiere verificar sus vínculos, cliente, divisa o estructura de partidas.</p>}
          {invoice.empty_positive && <p role="status" className="text-sm text-warning-text">Importe positivo sin partidas verificables. La revisión permanece pendiente; no es posible inventar partidas para conciliarla.</p>}
          {invoice.lines.map((line) => <ReviewedLine key={`${line.line_index}:${line.line_hash}`} data={data} invoice={invoice} line={line} canWrite={canWrite} onSelect={onSelect} />)}
        </section>
      ))}
    </div>
  );
}
