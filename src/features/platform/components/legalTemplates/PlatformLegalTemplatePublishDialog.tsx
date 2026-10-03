import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { listPlatformLegalTemplatesFn, type LegalTemplateContent, type PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.functions";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { usePlatformCapabilities } from "../../hooks/usePlatformAccess";
import { usePlatformLegalTemplateAssignments, usePublishPlatformLegalTemplateVersion } from "../../hooks/usePlatformLegalTemplates";
import { isPlatformEditConflict } from "../../lib/platformEditConflict";
import { PlatformEditConflict } from "../PlatformEditConflict";
import { LegalTemplateContentEditor } from "./LegalTemplateContentEditor";
import { LegalTemplateComparison, LegalTemplatePreview } from "./LegalTemplatePreview";

export function PlatformLegalTemplatePublishDialog({
  template,
  open,
  onOpenChange,
}: {
  template: PlatformLegalTemplateRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [content, setContent] = useState<LegalTemplateContent>(() => structuredClone(template.content));
  const [summary, setSummary] = useState("");
  const [assignAll, setAssignAll] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(template.current_version_id);
  const [baseContent, setBaseContent] = useState(template.content);
  const [baseVersion, setBaseVersion] = useState(Number(template.current_version ?? 0));
  const { can } = usePlatformCapabilities();
  const assignments = usePlatformLegalTemplateAssignments(template.id, open && assignAll && can("templates.assign"));
  const publish = usePublishPlatformLegalTemplateVersion();
  const conflict = isPlatformEditConflict(publish.error);
  const isDirty = summary.trim() !== "" || JSON.stringify(content) !== JSON.stringify(template.content) || assignAll;

  const submit = () => {
    if (publish.isPending || conflict || (assignAll && (assignments.isPending || assignments.isError))) return;
    if (!summary.trim()) {
      notifyValidation({ message: "Describe qué cambia en esta versión" });
      return;
    }
    publish.mutate({
      definition_id: template.id,
      expected_version_id: expectedVersion,
      content,
      change_summary: summary,
      assign_all_active: assignAll,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Publicar versión ${baseVersion + 1}`}
      description={`Se parte de la versión ${baseVersion || "inicial"}. La versión publicada quedará inmutable.`}
      width="2xl"
      isPending={publish.isPending}
      isDirty={isDirty && !publish.isSuccess}
    >
      <div className="space-y-6 py-2">
        {conflict && <PlatformEditConflict loadCurrent={async () => {
          const current = (await listPlatformLegalTemplatesFn()).find((row) => row.id === template.id);
          if (!current) throw new Error("El machote ya no está disponible.");
          setBaseContent(current.content); setBaseVersion(Number(current.current_version ?? 0));
          return { token: current.current_version_id, preview: <LegalTemplatePreview content={current.content} /> };
        }} onUseCurrent={(token) => { setExpectedVersion(token); publish.reset(); }} />}
        <Tabs defaultValue="edit" className="space-y-4"><TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="edit">Editar</TabsTrigger><TabsTrigger value="preview">Vista previa</TabsTrigger><TabsTrigger value="changes">Cambios</TabsTrigger>
        </TabsList><TabsContent value="edit"><LegalTemplateContentEditor value={content} onChange={setContent} /></TabsContent>
          <TabsContent value="preview"><LegalTemplatePreview content={content} /></TabsContent>
          <TabsContent value="changes"><LegalTemplateComparison before={baseContent} after={content} /></TabsContent></Tabs>
        <div className="space-y-2">
          <Label htmlFor="legal-change-summary">Resumen del cambio *</Label>
          <Textarea
            id="legal-change-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ej. Se actualiza la cláusula de mantenimiento preventivo."
          />
          <p className="text-xs text-muted-foreground">{summary.length}/500 caracteres</p>
        </div>
        {can("templates.assign") && <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="assign-all-legal">Adoptar en todas las empresas activas</Label>
            <p className="text-sm text-muted-foreground">
              Si está apagado, la nueva versión se publica y cada empresa conserva la versión que ya usa.
            </p>
          </div>
          <Switch id="assign-all-legal" checked={assignAll} onCheckedChange={setAssignAll} />
        </div>}
        {assignAll && <AffectedOrganizations query={assignments} />}
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={publish.isPending} />
        <Button onClick={submit} disabled={publish.isPending || conflict || (assignAll && (assignments.isPending || assignments.isError))}>Publicar versión</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function AffectedOrganizations({ query }: { query: ReturnType<typeof usePlatformLegalTemplateAssignments> }) {
  const affected = query.data?.filter((row) => row.organization_is_active) ?? [];
  return <section aria-label="Empresas afectadas" className="space-y-3 rounded-lg border p-4">
    <h3 className="font-medium">Empresas que adoptarían esta versión</h3>
    {query.isError ? <QueryErrorState error={query.error} entity="las empresas afectadas" onRetry={() => void query.refetch()} /> : query.isPending ?
      <p role="status">Consultando empresas…</p> : <><p className="text-sm">{affected.length} empresas activas en esta consulta. Los contratos firmados conservan su versión.</p>
        <ul className="space-y-1 text-sm">{affected.map((row) => <li key={row.organization_id}>{row.organization_name} · {row.version == null ? "Sin versión asignada" : `Versión actual ${row.version}`}</li>)}</ul></>}
  </section>;
}
