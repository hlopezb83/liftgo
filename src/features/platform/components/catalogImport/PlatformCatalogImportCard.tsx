import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { CatalogImportKind, CatalogImportSummary } from "@/lib/platformCatalogImport.types";
import { usePlatformCapabilities } from "../../hooks/usePlatformAccess";
import { useCatalogImportCandidates } from "../../hooks/usePlatformCatalogImport";
import { CATALOG_IMPORT_STATUS } from "../../lib/catalogImportPresentation";
import { CatalogImportReviewDialog } from "./CatalogImportReviewDialog";

function CatalogImportCandidates({ kind }: { kind: CatalogImportKind }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<CatalogImportSummary | null>(null);
  const query = useCatalogImportCandidates(kind, offset);
  if (query.isError) return <QueryErrorState error={query.error} bare entity="las incorporaciones" onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) return <p role="status" className="py-10 text-center text-sm text-muted-foreground">Cargando incorporaciones…</p>;
  const { source_organization: source, items, total, pending } = query.data;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>Origen: <span className="font-medium">{source?.name ?? "Sin fuente configurada"}</span>{source && !source.is_active && " · Sin acceso empresarial"}</p>
      <p className="text-muted-foreground">{pending} por incorporar · {total} {total === 1 ? "registro" : "registros"}</p>
    </div>
    {items.length ? <ul className="divide-y rounded-lg border">{items.map((item) => (
      <li key={item.source_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2"><p className="break-words font-medium">{item.title}</p>
          <Badge variant="outline">{CATALOG_IMPORT_STATUS[item.status]}</Badge>
          {item.issue && item.status !== "imported" && <p className="text-sm text-muted-foreground">{item.issue}</p>}
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setSelected(item)}
          aria-label={`Revisar ${item.title}`}>{item.status === "imported" ? "Ver comparación" : "Revisar"}</Button>
      </li>
    ))}</ul> : <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No hay registros de este tipo en Org 1.</p>}
    {total > 20 && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">Página {offset / 20 + 1} de {Math.ceil(total / 20)}</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(offset - 20)}>Anterior</Button>
        <Button size="sm" variant="outline" disabled={offset + 20 >= total || query.isFetching} onClick={() => setOffset(offset + 20)}>Siguiente</Button></div>
    </div>}
    {selected && <CatalogImportReviewDialog key={selected.source_id} candidate={selected} onClose={() => setSelected(null)} />}
  </div>;
}

export function PlatformCatalogImportCard() {
  const { can } = usePlatformCapabilities();
  const [kind, setKind] = useState<CatalogImportKind>(can("catalogs.import") ? "model" : "template");
  return <Card>
    <CardHeader><CardTitle>Importar desde empresa de origen</CardTitle>
      <CardDescription>Revisa nuevas fichas, coincidencias y contenido antes de compartirlos con el ecosistema LiftGo.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="max-w-xs space-y-2"><Label htmlFor="catalog-import-kind">Tipo de registro</Label>
        <select id="catalog-import-kind" value={kind} onChange={(event) => setKind(event.target.value as CatalogImportKind)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          {can("catalogs.import") && <><option value="model">Modelos de equipos</option><option value="part">SKUs de refacciones</option></>}{can("templates.import") && <option value="template">Plantillas de contrato y pagaré</option>}
        </select>
      </div>
      <CatalogImportCandidates key={kind} kind={kind} />
    </CardContent>
  </Card>;
}
