import type { Database } from "@/integrations/supabase/types";

export interface PortalPaymentRow {
  id: string;
  invoice_id: string | null;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  amount: number | string;
  invoices: { invoice_number: string } | null;
}

export interface PortalCustomerRow {
  id: string;
  name: string;
  rfc: string | null;
  domicilio_fiscal_cp: string | null;
}

export type ForkliftBrief = { id: string; name: string | null; model: string | null; manufacturer: string | null };

export interface PortalPage<T> {
  rows: T[];
  totalCount: number;
}

export interface RpcPagePayload<T> {
  rows?: T[] | null;
  total_count?: number | string | null;
}

export type PortalInvoiceRow = Database["public"]["Functions"]["get_portal_invoices"]["Returns"][number];
export type PortalContractBase = Database["public"]["Functions"]["get_portal_contracts"]["Returns"][number];
export type PortalContractRow = PortalContractBase & { forklifts: ForkliftBrief | null };

export interface PortalBookingRow {
  id: string;
  forklift_id: string;
  start_date: string;
  end_date: string;
  status: string;
  forklifts: ForkliftBrief | null;
}

export type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
