import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { historicalClassificationLabel, type HistoricalReconciliation } from "../../lib/historicalReconciliation";

export function HistoricalReconciliationCard({ reconciliation }: { reconciliation?: HistoricalReconciliation | null }) {
  if (!reconciliation) return null;
  const evidence = reconciliation.evidence;
  const description = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    && typeof evidence.description === "string" ? evidence.description : null;
  const revoked = reconciliation.revoked_at !== null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Conciliación histórica administrativa</CardTitle></CardHeader>
      <CardContent className="space-y-3 break-words">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{revoked ? "Conciliación revocada" : "Conciliada históricamente"}</Badge>
          <Badge variant="outline">{historicalClassificationLabel(reconciliation.classification)}</Badge>
        </div>
        <p className="text-sm">Este registro conserva su estado logístico original. La conciliación no acredita una nueva entrega física ni una firma de recepción.</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Fecha de referencia autorizada</dt><dd>{formatDateMty(reconciliation.reference_date)}</dd></div>
          <div><dt className="font-medium">Base de la fecha</dt><dd>{reconciliation.date_basis === "booking_start_authorized" ? "Inicio de reserva autorizado" : "Emisión de factura de venta autorizada"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Motivo</dt><dd>{reconciliation.reason}</dd></div>
          {description && <div className="sm:col-span-2"><dt className="font-medium">Evidencia de conciliación</dt><dd>{description}</dd></div>}
          {revoked && <div className="sm:col-span-2"><dt className="font-medium">Motivo de revocación</dt><dd>{reconciliation.revocation_reason}</dd></div>}
        </dl>
      </CardContent>
    </Card>
  );
}
