import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { supabase } from "@/integrations/supabase/client";

export type BreadcrumbTable =
  | "forklifts"
  | "invoices"
  | "quotes"
  | "customers"
  | "contracts"
  | "bookings"
  | "deliveries"
  | "return_inspections"
  | "suppliers";

export interface BreadcrumbResolver {
  table: BreadcrumbTable;
  select: string;
  format: (row: Record<string, unknown>) => string | null;
}

export interface BreadcrumbFilter extends Record<string, unknown> {
  table: BreadcrumbTable | null;
  select: string | null;
  id: string | null;
}

export const breadcrumbLabelQueries = defineEntityQueries("breadcrumb-label", {
  list: (filter?: Readonly<Record<string, unknown>>) => async (): Promise<Record<string, unknown> | null> => {
    const { table, select, id } = (filter ?? {}) as BreadcrumbFilter;
    if (!table || !select || !id) return null;
    // Boundary: supabase typings no soportan select dinámico desde unión de tablas.
    // Castigo aislado a una sola línea; el resto del hook es 100% tipado.
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("id", id)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return data;
  },
  staleTime: 60_000,
});
