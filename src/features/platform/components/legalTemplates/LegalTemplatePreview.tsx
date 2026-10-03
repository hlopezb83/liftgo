import type { LegalTemplateContent } from "@/lib/platformLegalTemplates.types";
import { legalTemplateDifferences, legalTemplateSections } from "../../lib/legalTemplateReview";

export function LegalTemplatePreview({ content }: { content: LegalTemplateContent }) {
  return <div className="space-y-5">{legalTemplateSections(content).filter((section) => section.text).map((section) =>
    <section key={section.label} className="space-y-2"><h3 className="font-medium">{section.label}</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.text}</p></section>)}
    <p className="border-t pt-3 text-xs text-muted-foreground">Vista del machote. Los datos de la empresa, cliente y operación se completan al generar el documento.</p>
  </div>;
}

export function LegalTemplateComparison({ before, after }: { before: LegalTemplateContent; after: LegalTemplateContent }) {
  const differences = legalTemplateDifferences(before, after);
  if (!differences.length) return <p role="status" className="text-sm text-muted-foreground">No hay diferencias de contenido.</p>;
  return <div className="space-y-5">{differences.map((section) => <section key={section.label} className="space-y-2">
    <h3 className="font-medium">{section.label}</h3><div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Antes</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.before || "Sin contenido"}</p></div>
      <div className="min-w-0 rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Después</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.after || "Sin contenido"}</p></div>
    </div></section>)}</div>;
}
