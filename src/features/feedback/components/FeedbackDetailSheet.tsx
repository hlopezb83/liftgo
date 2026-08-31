import { Activity } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WarnIcon, ResetIcon } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useClassifyFeedback } from "../hooks/useClassifyFeedback";
import { useFeedbackHistory, type FeedbackReport } from "../hooks/useFeedbackReports";
import { useFeedbackScreenshotUrl } from "../hooks/useFeedbackScreenshotUrl";
import { useFeedbackStatusUpdate } from "../hooks/useFeedbackStatusUpdate";
import { FeedbackChipsRow, AiReasoningCard } from "./FeedbackDetailChips";
import { FeedbackMetaList, FeedbackHistoryList } from "./FeedbackDetailParts";
import { FeedbackStatusBadge } from "./FeedbackStatusBadge";
import { FeedbackStatusChanger } from "./FeedbackStatusChanger";

interface Props {
  report: FeedbackReport | null;
  onClose: () => void;
}

export function FeedbackDetailSheet({ report, onClose }: Props) {
  const statusUpdate = useFeedbackStatusUpdate(report);
  const classify = useClassifyFeedback();
  const { data: history } = useFeedbackHistory(report?.id ?? null);
  const { data: signedUrl, isError: screenshotError, refetch: refetchScreenshot } = useFeedbackScreenshotUrl(report?.screenshot_url);

  // Auto-trigger AI classification when report opens with no classification yet.
  usePrefillEffect(() => {
    if (!report) return;
    const ctx = (report.context_json ?? {}) as Record<string, unknown>;
    const needsClassification = !ctx.ai_classification && (report.module === "Sin clasificar" || !report.severity);
    if (needsClassification && !classify.isPending) {
      classify.mutate({ reportId: report.id });
    }
  }, [report?.id]);

  if (!report) return null;
  const ctx = (report.context_json ?? {}) as Record<string, unknown>;
  const aiClass = ctx.ai_classification as
    | { severity: string; module: string; reasoning: string; classified_at: string; model: string }
    | undefined;
  const selectedEl = ctx.selected_element as
    | { tagName: string; text: string; cssPath: string }
    | undefined;



  return (
    <Sheet open={!!report} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{report.folio}</span>
            <FeedbackStatusBadge status={statusUpdate.optimisticStatus} />
          </SheetTitle>
        </SheetHeader>


        <Activity mode={report ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <FeedbackChipsRow
            type={report.type}
            module={report.module}
            severity={report.severity}
            hasAi={!!aiClass}
            classifying={classify.isPending}
            points={report.points_awarded}
          />

          {aiClass && (
            <AiReasoningCard
              reasoning={aiClass.reasoning}
              onReclassify={() => classify.mutate({ reportId: report.id, force: true })}
              reclassifying={classify.isPending}
            />
          )}


          <div>
            <h3 className="font-medium">{report.title}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{report.description}</p>
          </div>

          {selectedEl && (
            <div className="text-xs bg-muted/30 rounded-md p-2 border space-y-1">
              <div className="font-medium">Elemento señalado</div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="font-mono">{selectedEl.tagName}</Badge>
                {selectedEl.text && <Badge variant="outline">"{selectedEl.text}"</Badge>}
              </div>
              <div className="font-mono text-3xs text-muted-foreground truncate">{selectedEl.cssPath}</div>
            </div>
          )}

          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
              <img src={signedUrl} alt="Captura" className="max-h-64 w-full object-contain rounded-md border" />
            </a>
          )}

          {/* A6R2-8: si hay screenshot_url pero la URL firmada falló al cargar
              (bucket/red), mostramos un estado de error distinguible del caso
              "sin captura" (que simplemente no renderiza nada). */}
          {report.screenshot_url && screenshotError && (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <WarnIcon className="h-4 w-4 text-destructive shrink-0" />
              <span className="flex-1">No se pudo cargar la captura</span>
              <Button variant="outline" size="sm" onClick={() => void refetchScreenshot()}>
                <ResetIcon className="mr-2 h-4 w-4" />
                Reintentar
              </Button>
            </div>
          )}

          <Separator />

          <FeedbackMetaList
            reporterName={report.reporter_name}
            reporterType={report.reporter_type}
            createdAt={report.created_at}
            ctx={ctx}
          />

          <Separator />

          <FeedbackStatusChanger
            currentStatus={report.status}
            newStatus={statusUpdate.newStatus}
            onNewStatusChange={statusUpdate.setNewStatus}
            comment={statusUpdate.comment}
            onCommentChange={statusUpdate.setComment}
            onApply={statusUpdate.apply}
            pending={statusUpdate.pending}
          />



          <Separator />

          <FeedbackHistoryList history={history} />
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
