import type { Json } from "@/integrations/supabase/types";

/** Shape used across quote/invoice line_items JSONB columns. */
export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount?: number;
  // Domain-specific extensions are tolerated.
  [key: string]: unknown;
}

export interface RentalLineMeta {
  modelId: string;
  quantity: number;
}

/** Safely parse line_items from a JSONB column. */
export function parseLineItems(json: Json | null | undefined): LineItem[] {
  if (!Array.isArray(json)) return [];
  return json as unknown as LineItem[];
}

/** Safely parse rental_meta (array of model+quantity descriptors). */
export function parseRentalMeta(json: Json | null | undefined): RentalLineMeta[] {
  if (!Array.isArray(json)) return [];
  return json as unknown as RentalLineMeta[];
}

/** Serialize a LineItem[] back to the JSONB-compatible shape. */
export function serializeLineItems(items: LineItem[]): Json {
  return items as unknown as Json;
}

/** Serialize rental_meta back to JSONB. */
export function serializeRentalMeta(meta: RentalLineMeta[]): Json {
  return meta as unknown as Json;
}
