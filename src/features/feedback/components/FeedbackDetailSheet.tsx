import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { useUpdateFeedbackStatus, useFeedbackHistory, type FeedbackReport } from "@/features/feedback/hooks/useFeedbackReports";
import { useFeedbackScreenshotUrl } from "@/features/feedback/hooks/useFeedbackScreenshotUrl";
import { useClassifyFeedback } from "@/features/feedback/hooks/useClassifyFeedback";
import { FeedbackStatusBadge } from "./FeedbackStatusBadge";
import { FeedbackMetaList, FeedbackHistoryList } from "./FeedbackDetailParts";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  type FeedbackStatus,
} from "@/features/feedback/lib/constants";

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
  const severityLabel = report.severity
    ? FEEDBACK_SEVERITY_LABELS[report.severity as keyof typeof FEEDBACK_SEVERITY_LABELS]
    : null;
  const applyDisabled = !newStatus || update.isPending;

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
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline">{FEEDBACK_TYPE_LABELS[report.type as "bug" | "improvement"]}</Badge>
            <Badge variant={report.module === "Sin clasificar" ? "secondary" : "outline"}>
              {report.module}
            </Badge>
            {severityLabel && <Badge variant="outline">{severityLabel}</Badge>}
            {aiClass && (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" /> AI
              </Badge>
            )}
            {classify.isPending && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Clasificando con AI…
              </span>
            )}
            <Badge variant="secondary" className="ml-auto">{report.points_awarded} pts</Badge>
          </div>

          {aiClass && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 border">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Razonamiento del AI
                </span>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => classify.mutate(report.id)}
                  disabled={classify.isPending}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Reclasificar
                </Button>
              </div>
              <p>{aiClass.reasoning}</p>
            </div>
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

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Cambiar estado</h4>
            <div className="grid grid-cols-2 gap-2">
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as FeedbackStatus)}>
                <SelectTrigger><SelectValue placeholder="Nuevo estado" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FEEDBACK_STATUS_LABELS)
                    .filter(([k]) => k !== report.status)
                    .map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={applyDisabled} onClick={handleApply}>
                {update.isPending ? "Guardando…" : "Aplicar"}
              </Button>
            </div>
            <Textarea placeholder="Comentario (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>

          <Separator />

          <FeedbackHistoryList history={history} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
