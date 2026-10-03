import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportCase } from "@/lib/platformSupport.types";
import { usePlatformSupportEditor } from "../hooks/usePlatformSupportEditor";

export function PlatformSupportEditor({ record, assignees, onRefresh }: { record: SupportCase; assignees: { id: string; name: string | null }[]; onRefresh: () => Promise<SupportCase> }) {
  const { draft, setDraft, comment, setComment, save, refresh, changed, needsRefresh, pending, blocked, submit, loadCurrent } = usePlatformSupportEditor(record, onRefresh);
  return <form className="space-y-4 rounded-xl border bg-muted/30 p-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <h3 className="font-medium">Seguimiento</h3>
    {changed && <div role="status" className="space-y-2 text-sm"><p>El caso cambió. Tu borrador se conserva; carga el estado actual antes de guardar.</p>
      <Button variant="outline" type="button" disabled={pending || needsRefresh} onClick={loadCurrent}>Cargar estado actual</Button></div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="support-status">Estado</Label>
        <select id="support-status" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as SupportCase["status"] })}>
          {Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="support-severity">Severidad</Label>
        <select id="support-severity" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.severity}
          onChange={(e) => setDraft({ ...draft, severity: e.target.value as SupportCase["severity"] })}>
          {Object.entries(SUPPORT_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>
    <div className="space-y-2"><Label htmlFor="support-assignee">Responsable</Label>
      <select id="support-assignee" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.assigneeId ?? ""}
        onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value || null })}>
        <option value="">Sin asignar</option>
        {draft.assigneeId && !assignees.some((a) => a.id === draft.assigneeId) && <option value={draft.assigneeId}>Responsable ya no disponible</option>}
        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || "Operador"}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="support-comment">Nota de seguimiento para soporte</Label>
      <Textarea id="support-comment" disabled={pending} value={comment} maxLength={2000} rows={3} onChange={(e) => setComment(e.target.value)} />
      <p className="text-xs text-muted-foreground">Comparte sólo información necesaria para resolver el caso, sin contraseñas ni llaves.</p></div>
    {save.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{save.error.message}</p>
      <ErrorDiagnostic error={save.error} title="No se confirmó el seguimiento" phase="support-triage" /></div>}
    {needsRefresh && <div className="space-y-2 text-sm"><p>Actualiza el caso antes de repetir el guardado. Tu borrador se conserva.</p>
      <Button type="button" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>{refresh.isPending ? "Actualizando…" : "Actualizar estado del caso"}</Button></div>}
    {refresh.isError && <ErrorDiagnostic error={refresh.error} title="No se pudo actualizar el caso" phase="support-refresh" />}
    {save.isSuccess && <p role="status" className="text-sm">Seguimiento guardado.</p>}
    <Button type="submit" disabled={blocked}>{save.isPending ? "Guardando…" : "Guardar seguimiento"}</Button>
  </form>;
}
