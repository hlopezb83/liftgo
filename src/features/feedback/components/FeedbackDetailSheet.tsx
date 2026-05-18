import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useUpdateFeedbackStatus, useFeedbackHistory, type FeedbackReport } from "@/features/feedback/hooks/useFeedbackReports";
import { useFeedbackScreenshotUrl } from "@/features/feedback/hooks/useFeedbackScreenshotUrl";
import { FeedbackStatusBadge } from "./FeedbackStatusBadge";
import { FeedbackMetaList, FeedbackHistoryList } from "./FeedbackDetailParts";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  type FeedbackStatus,
} from "@/features/feedback/lib/constants";
import { format } from "date-fns";
import { useEffect } from "react";

interface Props {
  report: FeedbackReport | null;
  onClose: () => void;
}

export function FeedbackDetailSheet({ report, onClose }: Props) {
  const [newStatus, setNewStatus] = useState<FeedbackStatus | "">("");
  const [comment, setComment] = useState("");
  const update = useUpdateFeedbackStatus();
  const { data: history } = useFeedbackHistory(report?.id ?? null);
  const { data: signedUrl } = useFeedbackScreenshotUrl(report?.screenshot_url);

  useEffect(() => {
    setNewStatus("");
    setComment("");
  }, [report]);

  if (!report) return null;
  const ctx = (report.context_json ?? {}) as Record<string, unknown>;
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
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{FEEDBACK_TYPE_LABELS[report.type as "bug" | "improvement"]}</Badge>
            <Badge variant="outline">{report.module}</Badge>
            {severityLabel && <Badge variant="outline">{severityLabel}</Badge>}
            <Badge variant="secondary">{report.points_awarded} pts</Badge>
          </div>

          <div>
            <h3 className="font-medium">{report.title}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{report.description}</p>
          </div>

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
