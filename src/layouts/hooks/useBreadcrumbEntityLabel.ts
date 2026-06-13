import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ID_REGEX = /^[0-9a-f-]{20,}$/i;

/**
 * Devuelve un string si `value` es string no vacío, o `null`.
 * Tipado estricto: nunca usa `as`.
 */
function pickString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface ResolvedLabel {
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

const RESOLVERS: Record<string, ResolvedLabel> = {
  fleet: {
    table: "forklifts",
    select: "name,model,manufacturer",
    format: (r) => {
      const parts = [pickString(r.manufacturer), pickString(r.model)].filter(Boolean).join(" ");
      return parts || pickString(r.name);
    },
  },
  invoices: {
    table: "invoices",
    select: "invoice_number",
    format: (r) => pickString(r.invoice_number),
  },
  quotes: {
    table: "quotes",
    select: "quote_number",
    format: (r) => pickString(r.quote_number),
  },
  customers: {
    table: "customers",
    select: "name",
    format: (r) => pickString(r.name),
  },
  contracts: {
    table: "contracts",
    select: "contract_number",
    format: (r) => pickString(r.contract_number),
  },
  bookings: {
    table: "bookings",
    select: "booking_number,customer_name",
    format: (r) => pickString(r.booking_number) ?? pickString(r.customer_name),
  },
  deliveries: {
    table: "deliveries",
    select: "delivery_number",
    format: (r) => pickString(r.delivery_number),
  },
  returns: {
    table: "return_inspections",
    select: "inspection_number",
    format: (r) => pickString(r.inspection_number),
  },
  suppliers: {
    table: "suppliers",
    select: "name",
    format: (r) => pickString(r.name),
  },
};

export function useBreadcrumbEntityLabel(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  let parent: string | null = null;
  let id: string | null = null;
  if (segments.length >= 2 && RESOLVERS[segments[0]] && ID_REGEX.test(segments[1])) {
    parent = segments[0];
    id = segments[1];
  }

  const resolver = parent ? RESOLVERS[parent] : null;

  const query = useQuery({
    queryKey: ["breadcrumb-label", parent, id],
    enabled: !!resolver && !!id,
    staleTime: 60_000,
    queryFn: async () => {
      if (!resolver || !id) return null;
      const { data, error } = await supabase
        .from(resolver.table)
        .select(resolver.select)
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return null;
      return resolver.format(data as Record<string, unknown>);
    },
  });

  return {
    targetSegment: id,
    label: query.data ?? null,
    isLoading: query.isLoading,
  };
}
