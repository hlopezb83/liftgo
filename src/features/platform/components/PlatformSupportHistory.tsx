import { Button } from "@/components/ui/button";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportDetail } from "@/lib/platformSupport.types";
import { healthDate } from "../hooks/usePlatformHealth";

const ACTIONS = { shared: "Diagnóstico compartido", withdrawn: "Diagnóstico retirado", expired: "Retención cumplida", updated: "Seguimiento actualizado" } as const;
export function PlatformSupportHistory({ events, shared, hasMore, busy, onMore }: {
  events: SupportDetail["events"]; shared: boolean; hasMore: boolean; busy: boolean; onMore: () => void;
}) {
  return <section aria-label="Historial de soporte" className="space-y-3"><h3 className="font-semibold">Historial</h3>
    <ol className="space-y-3">{events.map((event) => <li key={event.id} className="rounded-lg border p-3 text-sm">
      <p className="font-medium">{ACTIONS[event.action]}</p><p className="text-xs text-muted-foreground">{event.actorName || "Sistema"} · {healthDate(event.createdAt)}</p>
      <p className="mt-2">{SUPPORT_STATUSES[event.status]} · {SUPPORT_SEVERITIES[event.severity]} · Responsable: {event.assigneeName || "Sin asignar"}</p>
      {shared && event.comment && <p className="mt-2 whitespace-pre-wrap break-words">{event.comment}</p>}
    </li>)}</ol>
    {hasMore && <Button variant="outline" disabled={busy} onClick={onMore}>Cargar eventos anteriores</Button>}
  </section>;
}
