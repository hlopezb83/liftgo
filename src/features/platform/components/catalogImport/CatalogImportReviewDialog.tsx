import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog } from "@/components/forms/FormDialog";
import { Badge } from "@/components/ui/badge";
import type { CatalogImportSummary } from "@/lib/platformCatalogImport.types";
import { useCatalogImportPreview } from "../../hooks/usePlatformCatalogImport";
import { CATALOG_IMPORT_STATUS } from "../../lib/catalogImportPresentation";
import { CatalogImportComparison } from "./CatalogImportComparison";
import { CatalogImportReviewForm } from "./CatalogImportReviewForm";

export function CatalogImportReviewDialog({ candidate, onClose }: { candidate: CatalogImportSummary; onClose: () => void }) {
  const query = useCatalogImportPreview({ kind: candidate.kind, source_id: candidate.source_id });
  const [pending, setPending] = useState(false);
  const preview = query.data;
  return <FormDialog open onOpenChange={(open) => !open && onClose()} isPending={pending}
    title="Revisar incorporación" description={candidate.title} width="2xl">
    {query.isError ? <QueryErrorState bare entity="la comparación" onRetry={() => void query.refetch()} />
      : query.isLoading || !preview ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Cargando comparación…</p>
      : <div className="space-y-5">
        <Badge variant="outline">{CATALOG_IMPORT_STATUS[preview.status]}</Badge>
        {preview.issue && <p role="status" className="rounded-lg border p-3 text-sm">{preview.issue}</p>}
        <CatalogImportComparison preview={preview} />
        <p className="text-sm text-muted-foreground">La incorporación conserva los datos locales de cada empresa. Las empresas habilitan los maestros y adoptan versiones legales por separado.</p>
        {preview.kind === "part" && preview.status === "new" && <p className="text-sm text-muted-foreground">La unidad inicial será pieza; revisa el maestro global si requiere otra unidad.</p>}
        {preview.status === "duplicate" && <p className="rounded-lg bg-muted/40 p-3 text-sm">Se registrará la equivalencia con el maestro existente, conservando su ficha global.</p>}
        {(preview.status === "new" || preview.status === "duplicate") && <CatalogImportReviewForm key={preview.fingerprint}
          preview={preview} onDone={onClose} onPendingChange={setPending} />}
      </div>}
  </FormDialog>;
}
