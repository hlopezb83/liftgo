import type { CatalogImportPreview } from "@/lib/platformCatalogImport.types";
import { catalogComparisonRows, catalogLegalText } from "../../lib/catalogImportPresentation";

export function CatalogImportComparison({ preview }: { preview: CatalogImportPreview }) {
  if (preview.kind === "template") {
    return <div className="grid gap-4 sm:grid-cols-2">
      {[{ label: "Machote de Org 1", data: preview.source }, { label: "Machote global", data: preview.match?.data }].map(({ label, data }) => (
        <section key={label} className="min-w-0 rounded-lg border p-4" aria-label={label}>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">{data?.name ?? "Se publicará una primera versión"}</p>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{data ? catalogLegalText(data.content) : "Sin coincidencia global."}</p>
        </section>
      ))}
    </div>;
  }
  return <div className="overflow-hidden rounded-lg border">
    <div className="hidden grid-cols-3 gap-4 bg-muted/40 p-3 text-xs font-medium sm:grid"><span>Campo</span><span>Org 1</span><span>Catálogo global</span></div>
    <dl className="divide-y">{catalogComparisonRows(preview).map((row) => (
      <div key={row.key} className="space-y-2 p-3 text-sm sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0">
        <dt className="font-medium">{row.label}</dt>
        <dd className="grid min-w-0 grid-cols-2 gap-4 sm:col-span-2">
          <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground sm:hidden">Org 1</p><p className="break-words">{String(row.source ?? "—")}</p></div>
          <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground sm:hidden">Catálogo global</p><p className="break-words">{String(row.target ?? "—")}</p></div>
        </dd>
      </div>
    ))}</dl>
  </div>;
}
