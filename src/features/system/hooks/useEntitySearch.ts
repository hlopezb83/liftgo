/**
 * Búsqueda global de entidades (facturas, clientes, reservas).
 *
 * Extraído de `src/layouts/GlobalSearch.tsx` (v6.0 audit P1-1) para respetar
 * la regla "UI shell no habla con la base de datos". El componente
 * `GlobalSearch` ahora consume este hook y sólo se ocupa de la UI (cmdk).
 */
import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";

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
  customers: EntityHit[];
  bookings: EntityHit[];
  /**
   * L-6a: si 1 o 2 de las 3 consultas fallan, la sección afectada se expone
   * aquí en vez de devolverse vacía (falso "sin resultados"). La UI muestra un
   * aviso por sección.
   */
  errors?: Partial<Record<"invoices" | "customers" | "bookings", string>>;
}

const EMPTY: EntityResults = { invoices: [], customers: [], bookings: [] };

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
): Promise<EntityResults> {
  const q = sanitizeSearchTerm(query.trim());
  if (q.length < 2 || !organizationId) return EMPTY;
  const like = `%${q}%`;
  const [invRes, custRes, bookRes] = await Promise.all([
    // M-3: no mostrar documentos cancelados ni clientes eliminados.
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total")
      .neq("status", "cancelled")
      .or(`invoice_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("organization_customers")
      .select("customer_id, customers!inner(id, name, rfc, deleted_at)")
      .eq("organization_id", organizationId)
      .is("customers.deleted_at", null)
      .or(`name.ilike.${like},rfc.ilike.${like}`, { referencedTable: "customers" })
      .limit(5),
    supabase
      .from("bookings")
      .select("id, booking_number, customer_name")
      .neq("status", "cancelled")
      .or(`booking_number.ilike.${like},customer_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  // M-10: antes los `.error` se ignoraban y la búsqueda devolvía vacío aunque
  // las 3 consultas hubieran fallado (falso "sin resultados"). Si TODAS
  // fallan, propagar el primer error para que la query entre en estado error.
  if (invRes.error && custRes.error && bookRes.error) throw invRes.error;
  // L-6a: fallo parcial — devolver las secciones OK y exponer el error por
  // sección para distinguirlo de "cero resultados".
  const errors: NonNullable<EntityResults["errors"]> = {};
  if (invRes.error) errors.invoices = invRes.error.message;
  if (custRes.error) errors.customers = custRes.error.message;
  if (bookRes.error) errors.bookings = bookRes.error.message;
  return {
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
    invoices: (invRes.data ?? []).map((i) => ({
      id: i.id,
      label: i.invoice_number ?? "—",
      sub: i.customer_name ?? undefined,
      url: `/invoices/${i.id}`,
    })),
    customers: (custRes.data ?? []).flatMap((row) => {
      const rel = (row as { customers?: CustomerRow | CustomerRow[] | null }).customers;
      const c = Array.isArray(rel) ? rel[0] : rel;
      if (!c) return [];
      return [{
        id: c.id,
        label: c.name ?? "—",
        sub: c.rfc ?? undefined,
        url: `/customers/${c.id}`,
      }];
    }),
    bookings: (bookRes.data ?? []).map((b) => ({
      id: b.id,
      label: b.booking_number ?? "—",
      sub: b.customer_name ?? undefined,
      url: `/bookings/${b.id}`,
    })),
  };
}

export function useEntitySearch(query: string, enabled: boolean) {
  const org = useOrganizationContext();
  const organizationId = org.status === "ready" ? org.organizationId : undefined;
  return useQuery({
    queryKey: ["global-search", organizationId ?? "unresolved", query],
    queryFn: () => searchEntities(query, organizationId),
    enabled: enabled && !!organizationId && query.trim().length >= 2,
    staleTime: 30_000,
  });
}
