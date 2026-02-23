import type { Tables } from "@/integrations/supabase/types";

/**
 * Invoice type extended with all CFDI 4.0 fiscal fields.
 * The base Tables<"invoices"> already includes these columns,
 * but this alias makes it explicit and avoids `as any` casts.
 */
export type Invoice = Tables<"invoices">;
