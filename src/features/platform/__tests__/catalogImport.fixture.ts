import type { CatalogImportPreview } from "@/lib/platformCatalogImport.types";
export const SOURCE_ID = "90000000-0000-4000-8000-000000000010";
export const ACTOR_ID = "90000000-0000-4000-8000-000000000001";
export function importPreview(): Extract<CatalogImportPreview, { kind: "model" }> {
  return { kind: "model", source_id: SOURCE_ID, title: "Atlas · Norte 30", status: "new", issue: null,
    fingerprint: "a".repeat(64), source_checksum: "b".repeat(64),
    source: { manufacturer: "Atlas", model: "Norte 30", capacity_kg: 3000, mast_height_m: 4.5, fuel_type: "Diesel" }, match: null };
}
