import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const hitSchema = z.object({
  id: z.string(), label: z.string(), sub: z.string().optional(), url: z.string(),
});
const sectionSchema = z.enum(["invoices", "quotes", "customers", "bookings", "deliveries", "returns"]);
const resultsSchema = z.object({
  invoices: z.array(hitSchema).max(5), quotes: z.array(hitSchema).max(5),
  customers: z.array(hitSchema).max(5), bookings: z.array(hitSchema).max(5),
  deliveries: z.array(hitSchema).max(5), returns: z.array(hitSchema).max(5),
  errors: z.partialRecord(sectionSchema, z.string()).optional(),
});

export type EntityResults = z.infer<typeof resultsSchema>;
export type EntitySearchPermissions = Record<z.infer<typeof sectionSchema>, boolean>;
export const EMPTY_SEARCH_RESULTS: EntityResults = {
  quotes: [], invoices: [], customers: [], bookings: [], deliveries: [], returns: [],
};

export function normalizeEntitySearchTerm(query: string): string {
  return query.trim().toLowerCase();
}

export async function searchEntities(
  query: string, organizationId: string | undefined, permissions: EntitySearchPermissions, signal?: AbortSignal,
): Promise<EntityResults> {
  const term = normalizeEntitySearchTerm(query);
  const sections = sectionSchema.options.filter((section) => permissions?.[section]);
  if (term.length < 2 || !organizationId || sections.length === 0) return EMPTY_SEARCH_RESULTS;
  signal?.throwIfAborted();
  const request = supabase.rpc("get_global_search", {
    p_expected_organization_id: organizationId, p_query: term, p_sections: sections,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  signal?.throwIfAborted();
  if (error) throw error;
  const parsed = resultsSchema.parse(data);
  const result = { ...EMPTY_SEARCH_RESULTS };
  const errors: NonNullable<EntityResults["errors"]> = {};
  for (const section of sections) {
    result[section] = parsed[section];
    if (parsed.errors?.[section]) errors[section] = "No se pudo completar la búsqueda.";
  }
  return Object.keys(errors).length ? { ...result, errors } : result;
}
