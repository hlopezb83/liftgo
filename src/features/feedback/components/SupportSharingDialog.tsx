import { useState } from "react";
import { z } from "zod";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES } from "@/lib/platformSupport.types";
import { useFeedbackScreenshotUrl } from "../hooks/useFeedbackScreenshotUrl";
import { useSupportSharing } from "../hooks/useSupportSharing";
import type { FeedbackReport } from "../hooks/useFeedbackReports";

function initialDiagnostic(report: FeedbackReport, record: ReturnType<typeof useSupportSharing>["query"]["data"]) {
  return { title: record?.title ?? report.title, description: record?.description ?? report.description,
    severity: record?.severity ?? report.severity ?? "medium", requestId: record?.requestId ?? "",
    screenshot: record?.hasScreenshot ?? false };
}
function validRequestId(value: string) {
  return !value.trim() || z.uuid().safeParse(value.trim()).success;
}
function canShare(busy: boolean, reviewed: boolean, requestValid: boolean) {
  return [!busy, reviewed, requestValid].every(Boolean);
}

function CapturePreview({ path }: { path: string }) {
  const image = useFeedbackScreenshotUrl(path);
  return image.isError ? <QueryErrorState error={image.error} entity="la captura" onRetry={() => void image.refetch()} /> : image.isPending ? <Skeleton className="h-40" /> :
    <img src={image.data ?? undefined} alt="Captura original: revisa su contenido antes de compartir" className="max-h-48 w-full rounded-lg border object-contain" />;
}
function SharingForm({ report, sharing, onClose }: { report: FeedbackReport; sharing: ReturnType<typeof useSupportSharing>; onClose: () => void }) {
  const record = sharing.query.data;
  const [draft, setDraft] = useState(initialDiagnostic(report, record));
  const { title, description, severity, requestId, screenshot } = draft;
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  const requestValid = validRequestId(requestId);
  const busy = sharing.share.isPending || sharing.withdraw.isPending;
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); sharing.share.mutate({
    revision: record?.revision ?? "0", title, description, severity, requestId: requestId.trim() || null, screenshot,
  }, { onSuccess: onClose }); }}>
    {record && <p role="status" className="rounded-lg bg-muted p-3 text-sm">Caso: {SUPPORT_STATUSES[record.status]} · {record.assigneeName || "Sin responsable"}. {record.shared ? "Diagnóstico compartido." : "Diagnóstico retirado o vencido."}</p>}
    <div className="space-y-2"><Label htmlFor="share-title">Título que recibirá soporte</Label><Input id="share-title" maxLength={150} minLength={5} required value={title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="share-description">Diagnóstico que recibirá soporte</Label>
      <Textarea id="share-description" maxLength={5000} minLength={10} required rows={4} value={description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="share-severity">Severidad</Label>
      <select id="share-severity" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
        {Object.entries(SUPPORT_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="share-request">requestId (opcional)</Label><Input id="share-request" maxLength={36} value={requestId} onChange={(e) => setDraft({ ...draft, requestId: e.target.value })} aria-invalid={!requestValid} /></div></div>
    {!requestValid && <p role="alert" className="text-sm text-destructive">El requestId debe ser una UUID del reporte de error.</p>}
    {report.screenshot_url && <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "Ocultar captura" : "Revisar captura original"}</Button>
      {preview && <CapturePreview path={report.screenshot_url} />}
      <div className="flex items-start gap-3"><Checkbox id="share-screenshot" checked={screenshot} onCheckedChange={(value) => setDraft({ ...draft, screenshot: value === true })} />
        <Label htmlFor="share-screenshot" className="leading-5">Compartir también la captura revisada. Puede contener información de la empresa.</Label></div>
    </div>}
    <p className="text-xs text-muted-foreground">Se compartirán estos textos, el módulo, la versión y el requestId indicado durante 90 días. Puedes retirar el diagnóstico. El reporte original y su estado permanecen en tu empresa.</p>
    <div className="flex items-start gap-3"><Checkbox id="share-reviewed" checked={reviewed} onCheckedChange={(value) => setReviewed(value === true)} />
      <Label htmlFor="share-reviewed" className="leading-5">Revisé el diagnóstico y autorizo compartirlo con soporte de LiftGo. No contiene contraseñas, llaves ni datos innecesarios.</Label></div>
    {(sharing.share.isError || sharing.withdraw.isError) && <div role="alert" className="space-y-2 text-sm">
      <p className="text-destructive">No se confirmó el cambio. Revisa los detalles y actualiza el caso antes de repetir.</p>
      <ErrorDiagnostic error={sharing.share.error ?? sharing.withdraw.error} title="No se pudo actualizar el diagnóstico compartido" phase="support-sharing" />
    </div>}
    <div className="flex flex-wrap justify-end gap-2">
      {record?.shared && <Button type="button" variant="outline" disabled={busy} onClick={() => sharing.withdraw.mutate(record.revision, { onSuccess: onClose })}>Retirar diagnóstico</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void sharing.query.refetch()}>Actualizar caso</Button>
      <Button type="submit" disabled={!canShare(busy, reviewed, requestValid)}>{sharing.share.isPending ? "Compartiendo…" : "Compartir diagnóstico"}</Button>
    </div>
  </form>;
}
export function SupportSharingDialog({ report, onClose }: { report: FeedbackReport; onClose: () => void }) {
  const sharing = useSupportSharing(report.id);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Compartir con soporte de LiftGo</DialogTitle><DialogDescription>{report.folio} · Revisa la información antes de compartirla.</DialogDescription></DialogHeader>
    {sharing.query.isError ? <QueryErrorState error={sharing.query.error} entity="el caso compartido" onRetry={() => void sharing.query.refetch()} /> : sharing.query.isPending ? <Skeleton className="h-60" /> :
      <SharingForm key={sharing.query.data?.revision ?? "0"} report={report} sharing={sharing} onClose={onClose} />}
  </DialogContent></Dialog>;
}
