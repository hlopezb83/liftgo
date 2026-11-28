/**
 * Tipos puros para resolución de labels de breadcrumbs.
 *
 * La query definition con I/O vive en `./breadcrumbLabelQueries`.
 */
type BreadcrumbTable =
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
