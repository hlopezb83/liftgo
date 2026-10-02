import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePlatformSupportFn } from "@/lib/platformSupport.functions";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportCase } from "@/lib/platformSupport.types";

export function PlatformSupportEditor({ record, assignees }: { record: SupportCase; assignees: { id: string; name: string | null }[] }) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState(record);
  const [comment, setComment] = useState("");
  const save = useMutation({ mutationFn: () => updatePlatformSupportFn({ data: { caseId: record.id, revision: draft.revision,
    status: draft.status, severity: draft.severity, assigneeId: draft.assigneeId, comment } }), meta: { silent: true },
    onSuccess: (result) => { setDraft(result); setComment(""); void cache.invalidateQueries({ queryKey: ["platform", "support"] }); } });
  const changed = record.revision !== draft.revision;
  return <form className="space-y-4 rounded-xl border bg-muted/30 p-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <h3 className="font-medium">Seguimiento</h3>
    {changed && <div role="status" className="space-y-2 text-sm"><p>El caso cambió. Tu borrador se conserva; carga el estado actual antes de guardar.</p>
      <Button variant="outline" type="button" onClick={() => { setDraft(record); setComment(""); save.reset(); }}>Cargar estado actual</Button></div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="support-status">Estado</Label>
        <select id="support-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as SupportCase["status"] })}>
          {Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="support-severity">Severidad</Label>
        <select id="support-severity" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.severity}
          onChange={(e) => setDraft({ ...draft, severity: e.target.value as SupportCase["severity"] })}>
          {Object.entries(SUPPORT_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>
    <div className="space-y-2"><Label htmlFor="support-assignee">Responsable</Label>
      <select id="support-assignee" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.assigneeId ?? ""}
        onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value || null })}>
        <option value="">Sin asignar</option>
        {draft.assigneeId && !assignees.some((a) => a.id === draft.assigneeId) && <option value={draft.assigneeId}>Responsable ya no disponible</option>}
        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || "Operador"}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="support-comment">Nota de seguimiento para soporte</Label>
      <Textarea id="support-comment" value={comment} maxLength={2000} rows={3} onChange={(e) => setComment(e.target.value)} />
      <p className="text-xs text-muted-foreground">Comparte sólo información necesaria para resolver el caso, sin contraseñas ni llaves.</p></div>
    {save.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{save.error.message}</p>
      <ErrorDiagnostic error={save.error} title="No se pudo guardar el seguimiento" phase="support-triage" /></div>}
    {save.isSuccess && <p role="status" className="text-sm">Seguimiento guardado.</p>}
    <Button type="submit" disabled={save.isPending || changed}>{save.isPending ? "Guardando…" : "Guardar seguimiento"}</Button>
  </form>;
}
