import { useId, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.types";
import { healthDate } from "../../hooks/usePlatformHealth";
import { usePlatformLegalTemplateVersions } from "../../hooks/usePlatformLegalTemplates";
import { LegalTemplateComparison, LegalTemplatePreview } from "./LegalTemplatePreview";

export function PlatformLegalTemplateHistoryDialog({ template, onClose }: {
  template: PlatformLegalTemplateRow; onClose: () => void;
}) {
  const id = useId();
  const query = usePlatformLegalTemplateVersions(template.id, true);
  const [selected, setSelected] = useState(template.current_version_id ?? "");
  const versions = query.data ?? [];
  const current = versions.find((version) => version.id === selected) ?? versions[0];
  const previous = current && versions.filter((version) => version.version < current.version).sort((a, b) => b.version - a.version)[0];
  return <FormDialog open title={`Historial · ${template.name}`} description="Consulta versiones y sus diferencias sin modificar asignaciones." width="2xl"
    onOpenChange={(open) => { if (!open) onClose(); }}>
    <div className="space-y-5 py-2">
      {query.isError ? <QueryErrorState error={query.error} entity="el historial legal" onRetry={() => void query.refetch()} /> : query.isPending ?
        <p role="status">Cargando versiones…</p> : current ? <>
          <div className="space-y-2"><Label htmlFor={id}>Versión a consultar</Label>
            <select id={id} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={current.id} onChange={(event) => setSelected(event.target.value)}>
              {versions.map((version) => <option key={version.id} value={version.id}>Versión {version.version} · {healthDate(version.created_at)}</option>)}
            </select></div>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">Versión {current.version}</Badge>
              {current.id === template.current_version_id && <Badge>Vigente</Badge>}</div>
            <p className="text-sm">{current.change_summary || "Sin resumen registrado"}</p>
            <p className="text-xs text-muted-foreground">{current.created_by_name || "Operador no disponible"} · {healthDate(current.created_at)}</p>
          </div>
          <Tabs defaultValue="content" className="space-y-4"><TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="content">Contenido</TabsTrigger><TabsTrigger value="changes">Cambios</TabsTrigger></TabsList>
            <TabsContent value="content"><LegalTemplatePreview content={current.content} /></TabsContent>
            <TabsContent value="changes">{previous ? <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Versión {previous.version} → versión {current.version}</p>
              <LegalTemplateComparison before={previous.content} after={current.content} />
            </div> : <p className="text-sm text-muted-foreground">Es la primera versión; no hay una anterior para comparar.</p>}</TabsContent>
          </Tabs>
        </> : <p role="status">Todavía no hay versiones publicadas.</p>}
    </div>
    <FormDialogFooter><FormDialogCancelButton onCancel={onClose} label="Cerrar" /></FormDialogFooter>
  </FormDialog>;
}
