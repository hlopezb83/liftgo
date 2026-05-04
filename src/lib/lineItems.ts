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

/** Safely parse line_items from a JSONB column as a typed LineItem[]. */
export function parseLineItems<T = LineItem>(json: Json | null | undefined): T[] {
  if (!Array.isArray(json)) return [];
  return json as T[];
}

/** Safely parse rental_meta (array of model+quantity descriptors). */
export function parseRentalMeta(json: Json | null | undefined): RentalLineMeta[] {
  if (!Array.isArray(json)) return [];
  return json as RentalLineMeta[];
}

/** Generic helper for any JSONB-stored array column. Returns [] when not an array. */
export function parseJsonbArray<T>(json: Json | null | undefined): T[] {
  if (!Array.isArray(json)) return [];
  return json as T[];
}

/** Serialize any array-shaped JSON-compatible value back to a Json column. */
export function toJsonArray<T>(items: readonly T[]): Json {
  return items as unknown as Json;
}
