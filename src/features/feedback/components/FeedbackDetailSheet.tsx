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
            {report.severity && <Badge variant="outline">{FEEDBACK_SEVERITY_LABELS[report.severity as keyof typeof FEEDBACK_SEVERITY_LABELS]}</Badge>}
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

          <div className="space-y-1 text-xs text-muted-foreground">
            <div><strong className="text-foreground">Reportado por:</strong> {report.reporter_name ?? "—"} ({report.reporter_type})</div>
            <div><strong className="text-foreground">Fecha:</strong> {format(new Date(report.created_at), "dd/MM/yyyy HH:mm")}</div>
            {ctx.route ? <div><strong className="text-foreground">Ruta:</strong> {String(ctx.route)}</div> : null}
            {ctx.viewport ? <div><strong className="text-foreground">Viewport:</strong> {String(ctx.viewport)}</div> : null}
            {ctx.app_version ? <div><strong className="text-foreground">Versión:</strong> {String(ctx.app_version)}</div> : null}
            {ctx.user_agent ? <div className="break-all"><strong className="text-foreground">UA:</strong> {String(ctx.user_agent)}</div> : null}
          </div>

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
              <Button
                disabled={!newStatus || update.isPending}
                onClick={() => {
                  if (!newStatus) return;
                  update.mutate(
                    { reportId: report.id, newStatus, comment: comment.trim() || undefined },
                    { onSuccess: () => { setNewStatus(""); setComment(""); } },
                  );
                }}
              >
                {update.isPending ? "Guardando…" : "Aplicar"}
              </Button>
            </div>
            <Textarea placeholder="Comentario (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Historial</h4>
            {(history ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sin cambios todavía.</p>}
            <ul className="space-y-2">
              {(history ?? []).map((h) => (
                <li key={h.id} className="text-xs border-l-2 border-border pl-3 py-1">
                  <div className="font-medium">
                    {h.from_status ? `${FEEDBACK_STATUS_LABELS[h.from_status as FeedbackStatus] ?? h.from_status} → ` : ""}
                    {FEEDBACK_STATUS_LABELS[h.to_status as FeedbackStatus] ?? h.to_status}
                  </div>
                  <div className="text-muted-foreground">{format(new Date(h.changed_at), "dd/MM/yyyy HH:mm")}</div>
                  {h.comment && <div className="text-muted-foreground italic mt-0.5">{h.comment}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
