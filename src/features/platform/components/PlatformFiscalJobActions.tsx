import { useQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listPlatformFiscalActionsFn } from "@/lib/platformFiscalActions.functions";
import { FISCAL_ACTION_STATUS, type FiscalAction } from "@/lib/platformFiscalActions.types";
import type { FiscalJob } from "@/lib/platformFiscalJobs.types";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { usePlatformFiscalAction } from "../hooks/usePlatformFiscalAction";
import { healthDate } from "../hooks/usePlatformHealth";

function actionAvailable(job: FiscalJob) {
  return job.configurationVerified && !job.removed && job.documentAvailable && job.state.status !== "processing"
    && job.modeAtEnqueue !== null && job.modeAtEnqueue === job.currentMode;
}
function reconcileLabel(busy: boolean, pendingIntent: "reconcile" | "retry" | undefined) {
  if (busy) return "Consultando…";
  return pendingIntent === "reconcile" ? "Comprobar la misma solicitud" : "Consultar y conciliar";
}
function ActionForm({ job, leaseExpired }: { job: FiscalJob; leaseExpired: boolean }) {
  const { reason, setReason, busy, pending, act } = usePlatformFiscalAction(job);
  const available = actionAvailable(job) || leaseExpired;
  const disabled = busy || (!available && !pending);
  return <>
    {!available && <p className="text-sm text-muted-foreground">Para actuar se necesita un documento disponible, un trabajo libre y el ambiente histórico conocido sin cambios. Actualiza el historial o revisa la configuración de la empresa.</p>}
    {leaseExpired && <p className="text-sm text-muted-foreground">La consulta anterior venció. La siguiente solicitud liberará la reserva y actualizará el historial, sin consultar de nuevo al proveedor.</p>}
    <div className="space-y-2"><Label htmlFor={`fiscal-reason-${job.id}`}>Motivo de la consulta</Label>
      <Textarea id={`fiscal-reason-${job.id}`} maxLength={300} value={reason} disabled={busy || !!pending}
        onChange={(event) => setReason(event.target.value)} placeholder="Describe lo que deseas comprobar. No incluyas llaves ni contraseñas." /></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled || pending?.intent === "retry"}
        onClick={() => void act("reconcile")}>{reconcileLabel(busy, pending?.intent)}</Button>
      <Button type="button" className="min-h-11" disabled={disabled || pending?.intent === "reconcile"}
        onClick={() => void act("retry")}>{pending?.intent === "retry" ? "Comprobar la misma solicitud" : "Consultar y reprogramar si procede"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">Máximo cinco reprogramaciones adicionales. Un resultado incierto, pendiente o fallido no habilita otro timbrado; cada consulta registra operador, motivo y resultado.</p>
  </>;
}
function ActionHistory({ actions }: { actions: FiscalAction[] }) {
  if (actions.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay consultas de plataforma para este trabajo.</p>;
  return <ol className="space-y-3">{actions.map((action) => <li key={action.id} className="space-y-1 rounded-lg bg-muted p-3 text-sm">
    <p className="font-medium">{FISCAL_ACTION_STATUS[action.status]}</p>
    <p className="text-xs text-muted-foreground">{healthDate(action.startedAt)} · Revisión {action.expectedRevision} · {action.intent === "retry" ? "Consultar y reprogramar si procede" : "Consultar y conciliar"}</p>
    <p className="break-words">{action.reason}</p>
    <p className="break-words text-xs text-muted-foreground">Operador: {action.actorName}</p>
    {action.status === "pending" && <p className="text-xs text-muted-foreground">Reserva hasta {healthDate(action.expiresAt)}. Si vence, comprueba la misma solicitud para liberarla.</p>}
  </li>)}</ol>;
}
export function PlatformFiscalJobActions({ job }: { job: FiscalJob }) {
  const { can } = usePlatformCapabilities();
  const query = useQuery<FiscalAction[]>({ queryKey: ["platform", "fiscal-jobs", "actions", job.id], retry: false, staleTime: 0,
    refetchInterval: (state) => state.state.data?.some((action) => action.status === "pending") ? 5000 : false,
    queryFn: ({ signal }) => listPlatformFiscalActionsFn({ data: { jobId: job.id }, signal }) });
  return <section className="space-y-4 rounded-lg border p-4" aria-label="Conciliación fiscal controlada">
    <h3 className="font-semibold">Conciliación con Facturapi</h3>
    <p className="text-sm text-muted-foreground">Consulta sólo este documento. Si Facturapi ya lo aceptó, conserva sus identificadores para la conciliación; no lo vuelve a timbrar. Reprogramar conserva intentos, folio y solicitud original.</p>
    {can("integrations.retry") && <ActionForm job={job} leaseExpired={!!query.data?.some((action) => action.status === "pending" && Date.parse(action.expiresAt) <= query.dataUpdatedAt)} />}
    {query.isError ? <QueryErrorState error={query.error} entity="las consultas fiscales" onRetry={() => void query.refetch()} />
      : query.isPending ? <p className="text-sm text-muted-foreground">Cargando consultas…</p>
      : <ActionHistory actions={query.data} />}
  </section>;
}
