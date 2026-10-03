import { useInfiniteQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformFiscalJobFn } from "@/lib/platformFiscalJobs.functions";
import { FISCAL_OPERATIONS, FISCAL_QUEUE_STATUSES, type FiscalJobDetail } from "@/lib/platformFiscalJobs.types";
import { healthDate } from "../hooks/usePlatformHealth";
import { fiscalJobGuidance, fiscalJobMode, fiscalJobStatus } from "../lib/fiscalJobPresentation";
import { PlatformFiscalJobActions } from "./PlatformFiscalJobActions";

const eventLabels = { snapshot: "Instantánea inicial del trabajo existente", queued: "Trabajo registrado", changed: "Estado de cola actualizado", removed: "Trabajo retirado de cola" } as const;
function JobHistory({ events }: { events: FiscalJobDetail["events"] }) {
  return <section aria-label="Historial del trabajo fiscal" className="space-y-4"><h3 className="font-semibold">Historial de la cola</h3>
    <ol className="space-y-3">{events.map((event) => <li key={event.id} className="space-y-2 rounded-lg border p-4 text-sm">
      <p className="font-medium">{eventLabels[event.kind]}</p><p className="text-xs text-muted-foreground">{healthDate(event.observedAt)} · Revisión {event.revision}</p>
      <p>{FISCAL_QUEUE_STATUSES[event.state.status]} · {event.state.attempts} de {event.state.maxAttempts} intentos · {event.state.deferrals} aplazamientos</p>
      {event.kind === "snapshot" && <p className="text-xs text-muted-foreground">Estado observado al habilitar el historial; no reconstruye intentos anteriores.</p>}
      {event.state.hasError && <p className="text-xs text-muted-foreground">La cola registró un error. Su texto original permanece en el ámbito de la empresa.</p>}
    </li>)}</ol>
  </section>;
}
export function PlatformFiscalJobDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const query = useInfiniteQuery({ queryKey: ["platform", "fiscal-jobs", "detail", jobId], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => getPlatformFiscalJobFn({ data: { jobId, before: pageParam }, signal }),
    getNextPageParam: (page) => page.nextCursor, retry: false, staleTime: 0 });
  const job = query.data?.pages[0]?.job;
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader><SheetTitle>Historial fiscal</SheetTitle><SheetDescription>{job?.organizationName ?? "Estado y transiciones del trabajo"}</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-6">
        {query.isError && <QueryErrorState error={query.error} entity="el historial fiscal" onRetry={() => void query.refetch()} />}
        {query.isPending ? <Skeleton className="h-64" /> : job && <>
          <div className="space-y-3"><h2 className="font-semibold break-words">{FISCAL_OPERATIONS[job.operation]} · {job.folio || job.documentId.slice(0, 8)}</h2>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">{fiscalJobStatus(job)}</Badge><Badge variant="outline">Documento: {job.documentStatus || "No disponible"}</Badge></div>
            <p className="rounded-lg border bg-muted p-4 text-sm">{fiscalJobGuidance(job)}</p></div>
          <Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar historial</Button>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Configuración al encolar</dt><dd className="mt-1">{fiscalJobMode(job.modeAtEnqueue)}</dd></div>
            <div><dt className="text-muted-foreground">Configuración actual</dt><dd className="mt-1">{fiscalJobMode(job.currentMode)}</dd></div>
            <div><dt className="text-muted-foreground">Registrado</dt><dd className="mt-1">{healthDate(job.createdAt)}</dd></div>
            <div><dt className="text-muted-foreground">Última transición observada</dt><dd className="mt-1">{healthDate(job.observedAt)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">ID del trabajo</dt><dd className="mt-1 break-all font-mono text-xs">{job.id}</dd></div>
          </dl>
          <PlatformFiscalJobActions job={job} />
          <JobHistory events={(query.data?.pages ?? []).flatMap((page) => page.events)} />
          {query.hasNextPage && <Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>Cargar historial anterior</Button>}
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
