import { supabase } from "@/integrations/supabase/client";
import type { ForkliftBrief, PortalPage, RpcPagePayload } from "./customerPortal.types";

const sel = (s: string): string => s;

export const PORTAL_CUSTOMER_COLUMNS = sel("id, name, rfc, domicilio_fiscal_cp");
export const PORTAL_BOOKING_COLUMNS = sel("id, forklift_id, start_date, end_date, status");
// v7.216.0 (C6): columnas explícitas — sólo las que consume la UI del portal
// (PortalStatement, PortalInvoiceDetail, PortalInvoicePayment).
export const PORTAL_PAYMENT_COLUMNS = sel(
  "id, invoice_id, payment_date, payment_method, reference_number, amount, invoices(invoice_number)",
);

export function parseRpcPage<T>(data: unknown): PortalPage<T> {
  const payload = (data ?? {}) as RpcPagePayload<T>;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalCount: Number(payload.total_count ?? 0),
  };
}

export const pageBounds = (page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return { safePage, safeSize, from: (safePage - 1) * safeSize, to: safePage * safeSize - 1 };
};

export async function fetchForkliftsBriefMap(): Promise<Map<string, ForkliftBrief>> {
  const { data, error } = await supabase.rpc("get_customer_forklifts_brief");
  if (error) throw error;
  const map = new Map<string, ForkliftBrief>();
  (data ?? []).forEach((f: ForkliftBrief) => map.set(f.id, f));
  return map;
}
