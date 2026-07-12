import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { supabase } from "@/integrations/supabase/client";

export interface BreadcrumbResolver {
  table:
    | "forklifts"
    | "invoices"
    | "quotes"
    | "customers"
    | "contracts"
    | "bookings"
    | "deliveries"
    | "return_inspections"
    | "suppliers";
  select: string;
  format: (row: Record<string, unknown>) => string | null;
}

export interface BreadcrumbFilter extends Record<string, unknown> {
  resolver: BreadcrumbResolver | null;
  id: string | null;
}

export const breadcrumbLabelQueries = defineEntityQueries("breadcrumb-label", {
  list: (filter?: Readonly<Record<string, unknown>>) => async () => {
    const { resolver, id } = (filter ?? {}) as BreadcrumbFilter;
    if (!resolver || !id) return null;
    // Boundary: supabase typings no soportan select dinámico desde unión de tablas.
    // Castigo aislado a una sola línea; el resto del hook es 100% tipado.
    const { data, error } = await supabase
      .from(resolver.table)
      .select(resolver.select)
      .eq("id", id)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return resolver.format(data);
  },
  staleTime: 60_000,
});
