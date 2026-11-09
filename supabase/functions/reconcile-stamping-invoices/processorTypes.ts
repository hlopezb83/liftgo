import type { getAdminClient } from "../_shared/supabaseClients.ts";
import type { FacturapiClient } from "../_shared/facturapi/client.ts";
import type { StuckRow } from "./decisions.ts";

export type ReconciliationAdmin = ReturnType<typeof getAdminClient>;
export type DocumentRow = Record<string, unknown>;
export interface StuckInvoice extends StuckRow {
  organization_id: string;
  serie: string | null;
  folio: string | null;
  updated_at: string;
}
export interface ReconciliationResult {
  invoice_id: string;
  status: string;
  error?: string;
  organization_id?: string;
}
/** Request-owned budget and organization-owned client, never recreated per lane. */
export interface ProcessorContext {
  admin: ReconciliationAdmin;
  client: FacturapiClient;
  organizationId: string;
  mode: "test" | "live";
  outOfBudget: () => boolean;
  results: ReconciliationResult[];
}
export interface SelectionContext {
  admin: ReconciliationAdmin;
  cutoff: string;
  manualOrganizationId: string | null;
  rowLimit: number;
}
