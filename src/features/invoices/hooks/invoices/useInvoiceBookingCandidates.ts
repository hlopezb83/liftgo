import { useQuery } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { bookingKeys } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";

const PAGE_SIZE = 200;

/** Candidates only; billing evidence and the transactional RPC remain authoritative. */
export async function fetchInvoiceBookingCandidates(
  organizationId: string,
  visibility: string,
  linkedIds: readonly string[],
  signal: AbortSignal,
) {
  if (!organizationId) throw new Error("Empresa no verificada");
  const baseQuery = () => supabase.from("bookings")
    .select("*, forklifts(name, model)").eq("organization_id", organizationId).or(visibility);
  type Row = NonNullable<Awaited<ReturnType<typeof baseQuery>>["data"]>[number];
  const rows = new Map<string, Row>();
  let cursor: string | undefined;
  let complete = false;
  for (let page = 0; page < 500; page++) {
    signal.throwIfAborted();
    let query = baseQuery().in("status", ["confirmed", "completed"])
      .order("id").limit(PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query.abortSignal(signal);
    signal.throwIfAborted();
    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) rows.set(row.id, row);
    if (batch.length < PAGE_SIZE) { complete = true; break; }
    cursor = batch[batch.length - 1].id;
  }
  if (!complete) throw new Error("No se pudo consultar todas las reservas facturables. Recarga y reintenta.");
  // Historical links must survive editing even when their status is no longer
  // a candidate. Fetch missing IDs separately without broadening new selections.
  const missing = [...new Set(linkedIds)].filter((id) => !rows.has(id));
  for (let from = 0; from < missing.length; from += PAGE_SIZE) {
    signal.throwIfAborted();
    const { data, error } = await baseQuery().in("id", missing.slice(from, from + PAGE_SIZE)).abortSignal(signal);
    signal.throwIfAborted();
    if (error) throw error;
    for (const row of data ?? []) rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
}

export function useInvoiceBookingCandidates(linkedIds: readonly string[]) {
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  const visibility = e2eVisibilityFilter();
  const ids = [...new Set(linkedIds)].sort();
  return useQuery({
    queryKey: bookingKeys.byFilter({ purpose: "invoice-candidates", identity, visibility, linkedIds: ids }),
    enabled: !!identity && !!organizationId,
    queryFn: ({ signal }) => fetchInvoiceBookingCandidates(organizationId ?? "", visibility, ids, signal),
    staleTime: 60_000,
  });
}
