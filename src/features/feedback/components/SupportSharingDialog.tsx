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
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportCase } from "@/lib/platformSupport.types";
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
function caseRevision(record: SupportCase | null | undefined) { return record?.revision ?? "0"; }
function sharingBusy(sharing: ReturnType<typeof useSupportSharing>) {
  return [sharing.share.isPending, sharing.withdraw.isPending, sharing.query.isFetching].some(Boolean);
}
function SharingCaseStatus({ record }: { record: SupportCase | null | undefined }) {
  if (!record) return null;
  return <p role="status" className="rounded-lg bg-muted p-3 text-sm">Caso: {SUPPORT_STATUSES[record.status]} · {record.assigneeName || "Sin responsable"}. {record.shared ? "Diagnóstico compartido." : "Diagnóstico retirado o vencido."}</p>;
}

function CapturePreview({ path }: { path: string }) {
  const image = useFeedbackScreenshotUrl(path);
  return image.isError ? <QueryErrorState error={image.error} entity="la captura" onRetry={() => void image.refetch()} /> : image.isPending ? <Skeleton className="h-40" /> :
    <img src={image.data ?? undefined} alt="Captura original: revisa su contenido antes de compartir" className="max-h-48 w-full rounded-lg border object-contain" />;
}
function SharingCapture({ path, checked, onChange }: { path: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const [preview, setPreview] = useState(false);
  return <div className="space-y-3">
    <Button type="button" variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "Ocultar captura" : "Revisar captura original"}</Button>
    {preview && <CapturePreview path={path} />}
    <div className="flex items-start gap-3"><Checkbox id="share-screenshot" checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor="share-screenshot" className="leading-5">Compartir también la captura revisada. Puede contener información de la empresa.</Label></div>
  </div>;
}
function SharingForm({ report, sharing, onClose }: { report: FeedbackReport; sharing: ReturnType<typeof useSupportSharing>; onClose: () => void }) {
  const record = sharing.query.data;
  const [draft, setDraft] = useState(initialDiagnostic(report, record));
  const { title, description, severity, requestId, screenshot } = draft;
  const [reviewed, setReviewed] = useState(false);
  const [revision, setRevision] = useState(caseRevision(record));
  const requestValid = validRequestId(requestId);
  const busy = sharingBusy(sharing);
  const changed = caseRevision(record) !== revision;
  const blocked = [busy, sharing.needsRefresh, changed].some(Boolean);
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!canShare(blocked, reviewed, requestValid)) return; sharing.share.mutate({
    revision, title, description, severity, requestId: requestId.trim() || null, screenshot,
  }, { onSuccess: onClose }); }}>
    <SharingCaseStatus record={record} />
    {changed && <div role="status" className="space-y-2 rounded-lg border p-3 text-sm"><p>El caso cambió. Tu borrador se conserva; revisa el diagnóstico actual antes de compartir.</p>
      <Button type="button" variant="outline" disabled={busy || sharing.needsRefresh} onClick={() => {
        setDraft(initialDiagnostic(report, record)); setRevision(caseRevision(record)); setReviewed(false);
      }}>Cargar diagnóstico actual</Button></div>}
    <div className="space-y-2"><Label htmlFor="share-title">Título que recibirá soporte</Label><Input id="share-title" maxLength={150} minLength={5} required value={title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="share-description">Diagnóstico que recibirá soporte</Label>
      <Textarea id="share-description" maxLength={5000} minLength={10} required rows={4} value={description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="share-severity">Severidad</Label>
      <select id="share-severity" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
        {Object.entries(SUPPORT_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="share-request">requestId (opcional)</Label><Input id="share-request" maxLength={36} value={requestId} onChange={(e) => setDraft({ ...draft, requestId: e.target.value })} aria-invalid={!requestValid} /></div></div>
    {!requestValid && <p role="alert" className="text-sm text-destructive">El requestId debe ser una UUID del reporte de error.</p>}
    {report.screenshot_url && <SharingCapture path={report.screenshot_url} checked={screenshot} onChange={(checked) => setDraft({ ...draft, screenshot: checked })} />}
    <p className="text-xs text-muted-foreground">Se compartirán estos textos, el módulo, la versión y el requestId indicado durante 90 días. Puedes retirar el diagnóstico. El reporte original y su estado permanecen en tu empresa.</p>
    <div className="flex items-start gap-3"><Checkbox id="share-reviewed" checked={reviewed} onCheckedChange={(value) => setReviewed(value === true)} />
      <Label htmlFor="share-reviewed" className="leading-5">Revisé el diagnóstico y autorizo compartirlo con soporte de LiftGo. No contiene contraseñas, llaves ni datos innecesarios.</Label></div>
    {(sharing.share.isError || sharing.withdraw.isError) && <div role="alert" className="space-y-2 text-sm">
      <p className="text-destructive">No se confirmó el cambio. Revisa los detalles y actualiza el caso antes de repetir.</p>
      <ErrorDiagnostic error={sharing.share.error ?? sharing.withdraw.error} title="No se pudo actualizar el diagnóstico compartido" phase="support-sharing" />
    </div>}
    <div className="flex flex-wrap justify-end gap-2">
      {record?.shared && <Button type="button" variant="outline" disabled={blocked} onClick={() => sharing.withdraw.mutate(revision, { onSuccess: onClose })}>Retirar diagnóstico</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void sharing.refresh()}>{sharing.query.isFetching ? "Actualizando…" : "Actualizar caso"}</Button>
      <Button type="submit" disabled={!canShare(blocked, reviewed, requestValid)}>{sharing.share.isPending ? "Compartiendo…" : "Compartir diagnóstico"}</Button>
    </div>
  </form>;
}
export function SupportSharingDialog({ report, onClose }: { report: FeedbackReport; onClose: () => void }) {
  const sharing = useSupportSharing(report.id);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Compartir con soporte de LiftGo</DialogTitle><DialogDescription>{report.folio} · Revisa la información antes de compartirla.</DialogDescription></DialogHeader>
    {sharing.query.isPending ? <Skeleton className="h-60" /> : sharing.query.isError && sharing.query.data === undefined ?
      <QueryErrorState error={sharing.query.error} entity="el caso compartido" onRetry={() => void sharing.refresh()} /> : <>
        {sharing.query.isError && <QueryErrorState error={sharing.query.error} entity="el estado actual del caso" onRetry={() => void sharing.refresh()} />}
        <SharingForm key={report.id} report={report} sharing={sharing} onClose={onClose} />
      </>}
  </DialogContent></Dialog>;
}
