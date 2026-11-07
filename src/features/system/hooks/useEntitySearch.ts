/**
 * Búsqueda global de entidades (facturas, cotizaciones, clientes, reservas).
 *
 * Extraído de `src/layouts/GlobalSearch.tsx` (v6.0 audit P1-1) para respetar
 * la regla "UI shell no habla con la base de datos". El componente
 * `GlobalSearch` ahora consume este hook y sólo se ocupa de la UI (cmdk).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useHasFinancialAccess, useHasModuleAccess } from "@/features/users";
import { supabase } from "@/integrations/supabase/client";
import { searchQuotes, settleSearch } from "./searchQuotes";

interface CustomerRow {
  id: string;
  name: string | null;
  rfc: string | null;
}

interface EntityHit {
  id: string;
  label: string;
  sub?: string;
  url: string;
}

export interface EntityResults {
  invoices: EntityHit[];
  quotes: EntityHit[];
  customers: EntityHit[];
  bookings: EntityHit[];
  deliveries: EntityHit[];
  returns: EntityHit[];
  /**
   * Las consultas fallidas se exponen por sección, conservando resultados
   * parciales en vez de devolver un falso "sin resultados".
   */
  errors?: Partial<Record<"invoices" | "quotes" | "customers" | "bookings" | "deliveries" | "returns", string>>;
}

const EMPTY: EntityResults = { quotes: [], invoices: [], customers: [], bookings: [], deliveries: [], returns: [] };

/**
 * M-10: el término se interpola crudo dentro de `.or()` de PostgREST — las
 * comas/paréntesis/comillas rompen la sintaxis del filtro y `%`/`_` actúan
 * como wildcards de ILIKE. Se eliminan los caracteres de sintaxis y se
 * escapan los wildcards (PostgREST usa `\` como escape de LIKE).
 */
function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,"'()]/g, "")
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Subtramo 6.1: los clientes se buscan partiendo de `organization_customers`
 * de la organización verificada en servidor y uniendo `customers` (que sigue
 * siendo identidad global). Sin organización resuelta no se consulta nada.
 */
export async function searchEntities(
  query: string,
  organizationId?: string,
  includeInvoices = true,
  includeQuotes = false,
): Promise<EntityResults> {
  const q = sanitizeSearchTerm(query.trim());
  if (q.length < 2 || !organizationId) return EMPTY;
  const like = `%${q}%`;
  const [invRes, custRes, bookRes, delRes, retRes, quoteRes] = await Promise.all([
    // M-3: no mostrar documentos cancelados ni clientes eliminados.
    includeInvoices ? settleSearch(supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total")
      .neq("status", "cancelled")
      .or(`invoice_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5)) : Promise.resolve({ data: [], error: null }),
    settleSearch(supabase
      .from("organization_customers")
      .select("customer_id, customers!inner(id, name, rfc, deleted_at)")
      .eq("organization_id", organizationId)
      .is("customers.deleted_at", null)
      .or(`name.ilike.${like},rfc.ilike.${like}`, { referencedTable: "customers" })
      .limit(5)),
    settleSearch(supabase
      .from("bookings")
      .select("id, booking_number, customer_name")
      .neq("status", "cancelled")
      .or(`booking_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5)),
    settleSearch(supabase
      .from("deliveries")
      .select("id, delivery_number, type, address")
      .or(`delivery_number.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5)),
    settleSearch(supabase
      .from("return_inspections")
      .select("id, inspection_number, bookings(customer_name)")
      .or(`inspection_number.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5)),
    includeQuotes ? searchQuotes(query, organizationId) : { hits: [], results: [] },
  ]);
  // Count only requests actually issued, including each quote lookup. A
  // successful empty response is still success; only all failures are fatal.
  const queriedResults = [...(includeInvoices ? [invRes] : []), custRes, bookRes, delRes, retRes, ...quoteRes.results];
  if (queriedResults.every((result) => result.error)) throw queriedResults[0].error;
  // L-6a: fallo parcial — devolver las secciones OK y exponer el error por
  // sección para distinguirlo de "cero resultados".
  const errors: NonNullable<EntityResults["errors"]> = {};
  for (const [section, result] of [
    ["invoices", invRes], ["customers", custRes], ["bookings", bookRes], ["deliveries", delRes], ["returns", retRes],
  ] as const) {
    if (result.error) errors[section] = result.error.message;
  }
  if (quoteRes.results.some((result) => result.error)) errors.quotes = "No se pudo completar la búsqueda de cotizaciones.";
  return {
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
    invoices: mapInvoices(invRes.data),
    quotes: quoteRes.hits,
    customers: mapCustomers(custRes.data),
    bookings: mapBookings(bookRes.data),
    deliveries: mapDeliveries(delRes.data),
    returns: mapReturns(retRes.data),
  };
}

function mapInvoices(rows: Array<{ id: string; invoice_number: string | null; customer_name: string | null }> | null): EntityHit[] {
  return (rows ?? []).map((i) => ({
    id: i.id,
    label: i.invoice_number ?? "—",
    sub: i.customer_name ?? undefined,
    url: `/invoices/${i.id}`,
  }));
}

function mapCustomers(rows: unknown[] | null): EntityHit[] {
  return (rows ?? []).flatMap((row) => {
    const rel = (row as { customers?: CustomerRow | CustomerRow[] | null }).customers;
    const c = Array.isArray(rel) ? rel[0] : rel;
    if (!c) return [];
    return [{
      id: c.id,
      label: c.name ?? "—",
      sub: c.rfc ?? undefined,
      url: `/customers/${c.id}`,
    }];
  });
}

function mapBookings(rows: Array<{ id: string; booking_number: string | null; customer_name: string | null }> | null): EntityHit[] {
  return (rows ?? []).map((b) => ({
    id: b.id,
    label: b.booking_number ?? "—",
    sub: b.customer_name ?? undefined,
    url: `/bookings/${b.id}`,
  }));
}

function mapDeliveries(rows: Array<{ id: string; delivery_number: string | null; type: string | null; address: string | null }> | null): EntityHit[] {
  return (rows ?? []).map((d) => ({
    id: d.id,
    label: d.delivery_number ?? "—",
    sub: d.type === "pickup" ? "Recolección" : d.type === "delivery" ? "Entrega" : (d.address ?? undefined),
    url: `/deliveries/${d.id}`,
  }));
}

function mapReturns(rows: Array<{ id: string; inspection_number: string | null }> | null): EntityHit[] {
  return (rows ?? []).map((r) => {
    const rel = (r as { bookings?: { customer_name: string | null } | null }).bookings;
    return {
      id: r.id,
      label: r.inspection_number ?? "—",
      sub: rel?.customer_name ?? undefined,
      url: `/returns/${r.id}`,
    };
  });
}

export function useEntitySearch(query: string, enabled: boolean) {
  const org = useOrganizationContext();
  const { user } = useAuth();
  const includeInvoices = useHasFinancialAccess();
  const includeQuotes = useHasModuleAccess("Cotizaciones", "read");
  const organizationId = org.status === "ready" ? org.organizationId : undefined;
  return useQuery({
    queryKey: ["global-search", organizationId ?? "unresolved", user?.id ?? "anonymous", includeInvoices, includeQuotes, query],
    queryFn: () => user?.id ? searchEntities(query, organizationId, includeInvoices, includeQuotes) : Promise.resolve(EMPTY),
    enabled: enabled && !!user?.id && !!organizationId && query.trim().length >= 2,
    staleTime: 30_000,
  });
}
