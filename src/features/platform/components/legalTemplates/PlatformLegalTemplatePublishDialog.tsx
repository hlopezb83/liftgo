import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { LegalTemplateContent, PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.functions";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { usePublishPlatformLegalTemplateVersion } from "../../hooks/usePlatformLegalTemplates";
import { LegalTemplateContentEditor } from "./LegalTemplateContentEditor";

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
  const publish = usePublishPlatformLegalTemplateVersion();
  const isDirty = summary.trim() !== "" || JSON.stringify(content) !== JSON.stringify(template.content) || assignAll;

  const submit = () => {
    if (!summary.trim()) {
      notifyValidation({ message: "Describe qué cambia en esta versión" });
      return;
    }
    publish.mutate({
      definition_id: template.id,
      content,
      change_summary: summary,
      assign_all_active: assignAll,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Publicar versión ${Number(template.current_version ?? 0) + 1}`}
      description={`Se parte de la versión ${template.current_version ?? "actual"}. La versión publicada quedará inmutable.`}
      width="2xl"
      isPending={publish.isPending}
      isDirty={isDirty && !publish.isSuccess}
    >
      <div className="space-y-6 py-2">
        <LegalTemplateContentEditor value={content} onChange={setContent} />
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
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="assign-all-legal">Adoptar en todas las empresas activas</Label>
            <p className="text-sm text-muted-foreground">
              Si está apagado, la nueva versión se publica y cada empresa conserva la versión que ya usa.
            </p>
          </div>
          <Switch id="assign-all-legal" checked={assignAll} onCheckedChange={setAssignAll} />
        </div>
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={publish.isPending} />
        <Button onClick={submit} disabled={publish.isPending}>Publicar versión</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
