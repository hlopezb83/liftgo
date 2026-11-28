import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { EXCLUDE_E2E_FILTER } from "@/lib/supabase/constants";

export type PolicyForklift = Pick<Tables<"forklifts">, "id" | "name" | "model" | "status" | "organization_id">;
export type PolicyBooking = Pick<Tables<"bookings">, "id" | "forklift_id" | "status" | "start_date" | "end_date" | "organization_id">;
export type PolicyReference = Pick<Tables<"maintenance_policies">, "id" | "forklift_id" | "organization_id">;
const PAGE_SIZE = 200;
// Resource budgets, not truncated results: exceeding either fails the entire
// read. Allow one final empty request after 50,000 rows at normal page size.
const MAX_REQUESTS = 251;
const MAX_ROWS = 50_000;

export class PolicyOptionsReadLimitError extends Error {
  constructor() {
    super("La consulta de pólizas es demasiado grande para cargarla completa. No se mostraron resultados parciales. Solicita apoyo para revisar la consulta antes de reintentar.");
    this.name = "PolicyOptionsReadLimitError";
  }
}

type ScopedRow = { id: string; organization_id: string | null };

function verifyPage<T extends ScopedRow>(page: T[], organizationId: string, after: string | undefined) {
  let cursor = after;
  for (const row of page) {
    if (typeof row.id !== "string" || !row.id || row.organization_id !== organizationId || (cursor && row.id <= cursor)) {
      throw new Error("No se pudo verificar la lista de montacargas para pólizas.");
    }
    cursor = row.id;
  }
  return cursor;
}

/** Keyset pages avoid a global cap and offset skips. Only an empty page ends
 * the read, so a lower PostgREST max_rows cannot silently truncate the list. */
async function readAll<T extends ScopedRow>(
  organizationId: string,
  signal: AbortSignal,
  readPage: (after: string | undefined) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (let request = 0; request < MAX_REQUESTS; request += 1) {
    signal.throwIfAborted();
    const { data, error } = await readPage(after);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("La consulta de montacargas para pólizas devolvió una respuesta inválida.");
    const page = data;
    if (page.length === 0) return rows;
    if (rows.length + page.length > MAX_ROWS) throw new PolicyOptionsReadLimitError();
    // RLS is authoritative; reject unexpected scope/cursor results rather
    // than turning an incomplete or cross-tenant response into eligibility.
    const cursor = verifyPage(page, organizationId, after);
    rows.push(...page);
    after = cursor;
  }
  throw new PolicyOptionsReadLimitError();
}

export function fetchPolicyForklifts(organizationId: string, signal: AbortSignal) {
  return readAll<PolicyForklift>(organizationId, signal, (after) => {
    let query = supabase.from("forklifts").select("id, name, model, status, organization_id")
      .eq("organization_id", organizationId).is("deleted_at", null).or(EXCLUDE_E2E_FILTER)
      .order("id").limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query.abortSignal(signal);
  });
}

export function fetchPolicyBookings(organizationId: string, today: string, visibility: string, signal: AbortSignal) {
  return readAll<PolicyBooking>(organizationId, signal, (after) => {
    let query = supabase.from("bookings").select("id, forklift_id, status, start_date, end_date, organization_id")
      .eq("organization_id", organizationId).or(visibility).eq("status", "confirmed")
      .lte("start_date", today).gte("end_date", today).order("id").limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query.abortSignal(signal);
  });
}

export function fetchPolicyReferences(organizationId: string, signal: AbortSignal) {
  return readAll<PolicyReference>(organizationId, signal, (after) => {
    // Inactive policies also reserve their equipment, matching the existing UI.
    let query = supabase.from("maintenance_policies").select("id, forklift_id, organization_id")
      .eq("organization_id", organizationId).order("id").limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query.abortSignal(signal);
  });
}
