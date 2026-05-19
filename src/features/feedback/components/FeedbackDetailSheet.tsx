import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useUpdateFeedbackStatus, useFeedbackHistory, type FeedbackReport } from "@/features/feedback/hooks/useFeedbackReports";
import { useFeedbackScreenshotUrl } from "@/features/feedback/hooks/useFeedbackScreenshotUrl";
import { useClassifyFeedback } from "@/features/feedback/hooks/useClassifyFeedback";
import { FeedbackStatusBadge } from "./FeedbackStatusBadge";
import { FeedbackMetaList, FeedbackHistoryList } from "./FeedbackDetailParts";
import { FeedbackChipsRow, AiReasoningCard } from "./FeedbackDetailChips";
import { FeedbackStatusChanger } from "./FeedbackStatusChanger";
import { type FeedbackStatus } from "@/features/feedback/lib/constants";

interface Props {
  report: FeedbackReport | null;
  onClose: () => void;
}

export function FeedbackDetailSheet({ report, onClose }: Props) {
  const [newStatus, setNewStatus] = useState<FeedbackStatus | "">("");
  const [comment, setComment] = useState("");
  const update = useUpdateFeedbackStatus();
  const classify = useClassifyFeedback();
  const { data: history } = useFeedbackHistory(report?.id ?? null);
  const { data: signedUrl } = useFeedbackScreenshotUrl(report?.screenshot_url);

  useEffect(() => {
    setNewStatus("");
    setComment("");
  }, [report]);

  // Auto-trigger AI classification when report opens with no classification yet.
  useEffect(() => {
    if (!report) return;
    const ctx = (report.context_json ?? {}) as Record<string, unknown>;
    const needsClassification = !ctx.ai_classification && (report.module === "Sin clasificar" || !report.severity);
    if (needsClassification && !classify.isPending) {
      classify.mutate(report.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  if (!report) return null;
  const ctx = (report.context_json ?? {}) as Record<string, unknown>;
  const aiClass = ctx.ai_classification as
    | { severity: string; module: string; reasoning: string; classified_at: string; model: string }
    | undefined;
  const selectedEl = ctx.selected_element as
    | { tagName: string; text: string; cssPath: string }
    | undefined;
  

  const handleApply = () => {
    if (!newStatus) return;
    update.mutate(
      { reportId: report.id, newStatus, comment: comment.trim() || undefined },
      { onSuccess: () => { setNewStatus(""); setComment(""); } },
    );
  };

  return (
    <Sheet open={!!report} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{report.folio}</span>
            <FeedbackStatusBadge status={report.status} />
          </SheetTitle>
        </SheetHeader>

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
              onReclassify={() => classify.mutate(report.id)}
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
              <div className="font-mono text-[10px] text-muted-foreground truncate">{selectedEl.cssPath}</div>
            </div>
          )}

          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
              <img src={signedUrl} alt="Captura" className="max-h-64 w-full object-contain rounded-md border" />
            </a>
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
            newStatus={newStatus}
            onNewStatusChange={setNewStatus}
            comment={comment}
            onCommentChange={setComment}
            onApply={handleApply}
            pending={update.isPending}
          />


          <Separator />

          <FeedbackHistoryList history={history} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
