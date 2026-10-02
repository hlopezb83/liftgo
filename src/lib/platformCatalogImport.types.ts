import { z } from "zod";

export const catalogImportKindSchema = z.enum(["model", "part", "template"]);
export const catalogImportStatusSchema = z.enum(["new", "duplicate", "conflict", "invalid", "imported"]);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
export const catalogImportListInputSchema = z.strictObject({
  kind: catalogImportKindSchema,
  offset: z.number().int().min(0).max(100000).default(0),
});
export const catalogImportPreviewInputSchema = z.strictObject({
  kind: catalogImportKindSchema,
  source_id: z.uuid(),
});
export const catalogImportInputSchema = catalogImportPreviewInputSchema.extend({
  request_id: z.uuid(),
  fingerprint,
  resolution: z.enum(["create", "reuse"]),
  reason: z.string().trim().min(5).max(500),
});
const summaryFields = {
  kind: catalogImportKindSchema,
  source_id: z.uuid(),
  title: z.string(),
  status: catalogImportStatusSchema,
  issue: z.string().nullable(),
};
export const catalogImportSummarySchema = z.object(summaryFields);
export const catalogImportPageSchema = z.object({
  source_organization: z.object({ id: z.uuid(), name: z.string(), is_active: z.boolean() }).nullable(),
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  items: z.array(catalogImportSummarySchema).max(20),
});
const modelData = z.object({
  manufacturer: z.string(), model: z.string(),
  capacity_kg: z.number().nullable(), mast_height_m: z.number().nullable(), fuel_type: z.string().nullable(),
});
const partData = z.object({
  sku: z.string().nullable(), name: z.string(), category: z.string().nullable(), unit_of_measure: z.string(),
});
const legalContent = z.object({
  body_text: z.string().nullable(), intro_text: z.string().nullable(), pagare_text: z.string().nullable(),
  declarations_landlord: z.array(z.string()), declarations_tenant: z.array(z.string()),
  clauses: z.array(z.object({ title: z.string(), body: z.string() })),
  checklist_sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
});
const templateData = z.object({ name: z.string(), content: legalContent });
const matchFields = { id: z.uuid(), name: z.string(), is_active: z.boolean(), version_id: z.uuid().optional() };
const previewFields = { ...summaryFields, fingerprint, source_checksum: fingerprint };
export const catalogImportPreviewSchema = z.discriminatedUnion("kind", [
  z.object({ ...previewFields, kind: z.literal("model"), source: modelData, match: z.object({ ...matchFields, data: modelData }).nullable() }),
  z.object({ ...previewFields, kind: z.literal("part"), source: partData, match: z.object({ ...matchFields, data: partData }).nullable() }),
  z.object({ ...previewFields, kind: z.literal("template"), source: templateData, match: z.object({ ...matchFields, data: templateData }).nullable() }),
]);
export const catalogImportResultSchema = z.object({
  id: z.uuid(), kind: catalogImportKindSchema, source_id: z.uuid(), target_id: z.uuid(),
  version_id: z.uuid().nullable(), resolution: z.enum(["create", "reuse"]),
});
export type CatalogImportKind = z.infer<typeof catalogImportKindSchema>;
export type CatalogImportSummary = z.infer<typeof catalogImportSummarySchema>;
export type CatalogImportPage = z.infer<typeof catalogImportPageSchema>;
export type CatalogImportPreview = z.infer<typeof catalogImportPreviewSchema>;
export type CatalogImportInput = z.infer<typeof catalogImportInputSchema>;
export type CatalogImportResult = z.infer<typeof catalogImportResultSchema>;
export type CatalogImportListInput = z.input<typeof catalogImportListInputSchema>;
export type CatalogImportPreviewInput = z.infer<typeof catalogImportPreviewInputSchema>;
