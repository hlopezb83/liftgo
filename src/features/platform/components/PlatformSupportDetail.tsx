import { useInfiniteQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformSupportFn } from "@/lib/platformSupport.functions";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportCase } from "@/lib/platformSupport.types";
import { withSupportRequest } from "@/lib/supportRequest";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { PlatformSupportDiagnostic } from "./PlatformSupportDiagnostic";
import { PlatformSupportEditor } from "./PlatformSupportEditor";
import { PlatformSupportHistory } from "./PlatformSupportHistory";

function supportHeading(record: SupportCase | undefined) {
  return { title: record?.folio ?? "Caso de soporte", description: record?.organizationName ?? "Diagnóstico compartido y seguimiento" };
}
export function PlatformSupportDetail({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { can } = usePlatformCapabilities();
  const query = useInfiniteQuery({ queryKey: ["platform", "support", "detail", caseId], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => withSupportRequest((requestSignal) => getPlatformSupportFn({ data: { caseId, before: pageParam }, signal: requestSignal }), signal),
    getNextPageParam: (page) => page.nextCursor, staleTime: 0, retry: false, refetchInterval: 30_000 });
  const data = query.data?.pages[0];
  const record = data?.case;
  const heading = supportHeading(record);
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader><SheetTitle>{heading.title}</SheetTitle>
        <SheetDescription>{heading.description}</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-6">
        {query.isError && !record ? <QueryErrorState error={query.error} entity="el caso" onRetry={() => void query.refetch()} /> : query.isPending ? <Skeleton className="h-64" /> : record && data && <>
          {query.isError && <QueryErrorState error={query.error} entity="el estado actual del caso" onRetry={() => void query.refetch()} />}
          <div className="flex flex-wrap gap-2"><Badge>{SUPPORT_STATUSES[record.status]}</Badge><Badge variant="outline">Severidad {SUPPORT_SEVERITIES[record.severity]}</Badge></div>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar caso</Button>
          {record.shared ? <>
            <PlatformSupportDiagnostic record={record} />
            {can("support.manage") && <PlatformSupportEditor key={record.id} record={record} assignees={data.assignees} onRefresh={async () => {
              const current = await query.refetch({ throwOnError: true });
              const refreshed = current.data?.pages[0]?.case;
              if (!refreshed) throw new Error("No se pudo confirmar el estado actual del caso.");
              return refreshed;
            }} />}
          </> : <p role="status" className="rounded-lg border bg-muted p-4 text-sm">El diagnóstico fue retirado o cumplió su retención. Se conserva la trazabilidad administrativa del caso.</p>}
          <PlatformSupportHistory events={(query.data?.pages ?? []).flatMap((page) => page.events)} shared={record.shared}
            hasMore={query.hasNextPage} busy={query.isFetching} onMore={() => void query.fetchNextPage()} />
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
