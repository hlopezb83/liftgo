import { useInfiniteQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformSupportFn } from "@/lib/platformSupport.functions";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES } from "@/lib/platformSupport.types";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { healthDate } from "../hooks/usePlatformHealth";
import { PlatformSupportDiagnostic } from "./PlatformSupportDiagnostic";
import { PlatformSupportEditor } from "./PlatformSupportEditor";

const ACTIONS = { shared: "Diagnóstico compartido", withdrawn: "Diagnóstico retirado", expired: "Retención cumplida", updated: "Seguimiento actualizado" } as const;
export function PlatformSupportDetail({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { can } = usePlatformCapabilities();
  const query = useInfiniteQuery({ queryKey: ["platform", "support", "detail", caseId], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getPlatformSupportFn({ data: { caseId, before: pageParam } }),
    getNextPageParam: (page) => page.nextCursor, staleTime: 0, refetchInterval: 30_000 });
  const data = query.data?.pages[0];
  const record = data?.case;
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader><SheetTitle>{record?.folio ?? "Caso de soporte"}</SheetTitle>
        <SheetDescription>{record?.organizationName ?? "Diagnóstico compartido y seguimiento"}</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-6">
        {query.isError ? <QueryErrorState entity="el caso" onRetry={() => void query.refetch()} /> : query.isPending ? <Skeleton className="h-64" /> : record && data && <>
          <div className="flex flex-wrap gap-2"><Badge>{SUPPORT_STATUSES[record.status]}</Badge><Badge variant="outline">Severidad {SUPPORT_SEVERITIES[record.severity]}</Badge></div>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar caso</Button>
          {record.shared ? <>
            <PlatformSupportDiagnostic record={record} />
            {can("support.manage") && <PlatformSupportEditor key={record.id} record={record} assignees={data.assignees} />}
          </> : <p role="status" className="rounded-lg border bg-muted p-4 text-sm">El diagnóstico fue retirado o cumplió su retención. Se conserva la trazabilidad administrativa del caso.</p>}
          <section aria-label="Historial de soporte" className="space-y-3"><h3 className="font-semibold">Historial</h3>
            <ol className="space-y-3">{query.data.pages.flatMap((page) => page.events).map((event) => <li key={event.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{ACTIONS[event.action]}</p><p className="text-xs text-muted-foreground">{event.actorName || "Sistema"} · {healthDate(event.createdAt)}</p>
              <p className="mt-2">{SUPPORT_STATUSES[event.status]} · {SUPPORT_SEVERITIES[event.severity]} · Responsable: {event.assigneeName || "Sin asignar"}</p>
              {record.shared && event.comment && <p className="mt-2 whitespace-pre-wrap break-words">{event.comment}</p>}
            </li>)}</ol>
            {query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>Cargar eventos anteriores</Button>}
          </section>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
