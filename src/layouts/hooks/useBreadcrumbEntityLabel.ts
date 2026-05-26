import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Resolver {
  table: string;
  select: string;
  format: (row: Record<string, unknown>) => string | null;
}

const RESOLVERS: Record<string, Resolver> = {
  fleet: {
    table: "forklifts",
    select: "name,model,manufacturer",
    format: (r) => {
      const parts = [r.manufacturer, r.model].filter(Boolean).join(" ");
      return parts || (r.name as string) || null;
    },
  },
  invoices: {
    table: "invoices",
    select: "invoice_number",
    format: (r) => (r.invoice_number as string) || null,
  },
  quotes: {
    table: "quotes",
    select: "quote_number",
    format: (r) => (r.quote_number as string) || null,
  },
  customers: {
    table: "customers",
    select: "name",
    format: (r) => (r.name as string) || null,
  },
  contracts: {
    table: "contracts",
    select: "contract_number",
    format: (r) => (r.contract_number as string) || null,
  },
  bookings: {
    table: "bookings",
    select: "booking_number,customer_name",
    format: (r) => (r.booking_number as string) || (r.customer_name as string) || null,
  },
  deliveries: {
    table: "deliveries",
    select: "delivery_number",
    format: (r) => (r.delivery_number as string) || null,
  },
  returns: {
    table: "return_inspections",
    select: "inspection_number",
    format: (r) => (r.inspection_number as string) || null,
  },
  suppliers: {
    table: "suppliers",
    select: "name",
    format: (r) => (r.name as string) || null,
  },
};

const ID_REGEX = /^[0-9a-f-]{20,}$/i;

export function useBreadcrumbEntityLabel(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  // Match /<parent>/<id>[/edit?]
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
        .from(resolver.table as never)
        .select(resolver.select)
        .eq("id", id)
        .maybeSingle();
      if (error) return null;
      if (!data) return null;
      return resolver.format(data as Record<string, unknown>);
    },
  });

  return {
    targetSegment: id,
    label: query.data ?? null,
    isLoading: query.isLoading,
  };
}
