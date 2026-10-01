import type { CatalogImportPreview, CatalogImportSummary } from "@/lib/platformCatalogImport.types";

export const CATALOG_IMPORT_STATUS: Record<CatalogImportSummary["status"], string> = {
  new: "Nuevo maestro", duplicate: "Coincidencia global", conflict: "Requiere revisión",
  invalid: "Origen incompleto", imported: "Ya incorporado",
};
export function catalogComparisonRows(preview: CatalogImportPreview) {
  const fields = preview.kind === "model"
    ? { manufacturer: "Fabricante", model: "Modelo", capacity_kg: "Capacidad (kg)", mast_height_m: "Altura de mástil (m)", fuel_type: "Combustible" }
    : { sku: "SKU", name: "Nombre", category: "Categoría", unit_of_measure: "Unidad de medida" };
  return Object.entries(fields).map(([key, label]) => ({
    key, label, source: Reflect.get(preview.source, key),
    target: preview.match ? Reflect.get(preview.match.data, key) : null,
  }));
}
export function catalogLegalText(content: Extract<CatalogImportPreview, { kind: "template" }>["source"]["content"]) {
  return [content.body_text, content.intro_text, ...content.declarations_landlord, ...content.declarations_tenant,
    ...content.clauses.map((clause) => `${clause.title}\n${clause.body}`),
    ...content.checklist_sections.map((section) => `${section.title}\n${section.items.join("\n")}`), content.pagare_text,
  ].filter(Boolean).join("\n\n");
}
