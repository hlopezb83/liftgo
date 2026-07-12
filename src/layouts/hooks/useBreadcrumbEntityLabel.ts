import { useQuery } from "@tanstack/react-query";
import { breadcrumbLabelQueries, type BreadcrumbResolver, type BreadcrumbFilter } from "../lib/queryKeys";

const ID_REGEX = /^[0-9a-f-]{20,}$/i;

/**
 * Devuelve un string si `value` es string no vacío, o `null`.
 * Tipado estricto: nunca usa `as`.
 */
function pickString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const RESOLVERS: Record<string, BreadcrumbResolver> = {
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
  const filter: BreadcrumbFilter = {
    table: resolver?.table ?? null,
    select: resolver?.select ?? null,
    id,
  };

  const query = useQuery({
    ...breadcrumbLabelQueries.list(filter),
    enabled: !!resolver && !!id,
    select: (row) => (row && resolver ? resolver.format(row) : null),
  });

  return {
    targetSegment: id,
    label: query.data ?? null,
    isLoading: query.isLoading,
  };
}
