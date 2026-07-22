/**
 * Búsqueda global de entidades (facturas, clientes, reservas).
 *
 * Extraído de `src/layouts/GlobalSearch.tsx` (v6.0 audit P1-1) para respetar
 * la regla "UI shell no habla con la base de datos". El componente
 * `GlobalSearch` ahora consume este hook y sólo se ocupa de la UI (cmdk).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EntityHit {
  id: string;
  label: string;
  sub?: string;
  url: string;
}

export interface EntityResults {
  invoices: EntityHit[];
  customers: EntityHit[];
  bookings: EntityHit[];
}

const EMPTY: EntityResults = { invoices: [], customers: [], bookings: [] };

export async function searchEntities(query: string): Promise<EntityResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY;
  const like = `%${q}%`;
  const [invRes, custRes, bookRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total")
      .or(`invoice_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("customers")
      .select("id, name, rfc")
      .or(`name.ilike.${like},rfc.ilike.${like}`)
      .order("name")
      .limit(5),
    supabase
      .from("bookings")
      .select("id, booking_number, customer_name")
      .or(`booking_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    invoices: (invRes.data ?? []).map((i) => ({
      id: i.id,
      label: i.invoice_number ?? "—",
      sub: i.customer_name ?? undefined,
      url: `/invoices/${i.id}`,
    })),
    customers: (custRes.data ?? []).map((c) => ({
      id: c.id,
      label: c.name ?? "—",
      sub: c.rfc ?? undefined,
      url: `/customers/${c.id}`,
    })),
    bookings: (bookRes.data ?? []).map((b) => ({
      id: b.id,
      label: b.booking_number ?? "—",
      sub: b.customer_name ?? undefined,
      url: `/bookings/${b.id}`,
    })),
  };
}

export function useEntitySearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["global-search", query],
    queryFn: () => searchEntities(query),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
  });
}
