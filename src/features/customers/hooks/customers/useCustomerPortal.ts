import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useVerifiedPortalCustomerId } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { portalKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

const PORTAL_CUSTOMER_COLUMNS = sel("id, name, rfc, domicilio_fiscal_cp");
const PORTAL_BOOKING_COLUMNS = sel("id, forklift_id, start_date, end_date, status");
// v7.216.0 (C6): columnas explícitas — sólo las que consume la UI del portal
// (PortalStatement, PortalInvoiceDetail, PortalInvoicePayment).
const PORTAL_PAYMENT_COLUMNS = sel(
  "id, invoice_id, payment_date, payment_method, reference_number, amount, invoices(invoice_number)",
);

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

type ForkliftBrief = { id: string; name: string | null; model: string | null; manufacturer: string | null };

export interface PortalPage<T> {
  rows: T[];
  totalCount: number;
}

interface RpcPagePayload<T> {
  rows?: T[] | null;
  total_count?: number | string | null;
}

function parseRpcPage<T>(data: unknown): PortalPage<T> {
  const payload = (data ?? {}) as RpcPagePayload<T>;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalCount: Number(payload.total_count ?? 0),
  };
}

export type PortalInvoiceRow = Database["public"]["Functions"]["get_portal_invoices"]["Returns"][number];
type PortalContractBase = Database["public"]["Functions"]["get_portal_contracts"]["Returns"][number];
export type PortalContractRow = PortalContractBase & { forklifts: ForkliftBrief | null };

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const pageBounds = (page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return { safePage, safeSize, from: (safePage - 1) * safeSize, to: safePage * safeSize - 1 };
};

async function fetchForkliftsBriefMap(): Promise<Map<string, ForkliftBrief>> {
  const { data, error } = await supabase.rpc("get_customer_forklifts_brief");
  if (error) throw error;
  const map = new Map<string, ForkliftBrief>();
  (data ?? []).forEach((f: ForkliftBrief) => map.set(f.id, f));
  return map;
}

export function usePortalCustomer() {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  // Multi-organización: la identidad del cliente viene de la cuenta del portal
  // verificada en servidor (usuario + empresa + cuenta activa), no del primer
  // registro visible de `customers`.
  const customerId = useVerifiedPortalCustomerId();
  return useQuery({
    queryKey: portalKeys.customer(scope ?? undefined),
    enabled: !!user && !!scope && !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!customerId) return null;
      const { data, error } = await supabase
        .from("customers")
        .select(PORTAL_CUSTOMER_COLUMNS)
        .eq("id", customerId)
        .maybeSingle()
        .returns<PortalCustomerRow>();
      if (error) throw error;
      return data;
    },
  });
}

export interface PortalBookingRow {
  id: string;
  forklift_id: string;
  start_date: string;
  end_date: string;
  status: string;
  forklifts: ForkliftBrief | null;
}

export function usePortalBookings() {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.bookings(scope ?? undefined),
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data, error }, forkliftMap] = await Promise.all([
        supabase
          .from("bookings")
          .select(PORTAL_BOOKING_COLUMNS)
          .order("start_date", { ascending: false })
          .returns<Pick<PortalBookingRow, "id" | "forklift_id" | "start_date" | "end_date" | "status">[]>(),
        fetchForkliftsBriefMap(),
      ]);
      if (error) throw error;
      return (data ?? []).map((b) => ({
        ...b,
        forklifts: b.forklift_id ? forkliftMap.get(b.forklift_id) ?? null : null,
      }));
    },
  });
}

export function usePortalBookingsPage(page: number, pageSize = 25) {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  const { safePage, safeSize, from, to } = pageBounds(page, pageSize);
  return useQuery({
    queryKey: [...portalKeys.bookings(scope ?? undefined), "page", safePage, safeSize] as const,
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async (): Promise<PortalPage<PortalBookingRow>> => {
      const [{ data, error, count }, forkliftMap] = await Promise.all([
        supabase
          .from("bookings")
          .select(PORTAL_BOOKING_COLUMNS, { count: "exact" })
          .order("start_date", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<Pick<PortalBookingRow, "id" | "forklift_id" | "start_date" | "end_date" | "status">[]>(),
        fetchForkliftsBriefMap(),
      ]);
      if (error) throw error;
      return {
        rows: (data ?? []).map((booking) => ({
          ...booking,
          forklifts: booking.forklift_id ? forkliftMap.get(booking.forklift_id) ?? null : null,
        })),
        totalCount: count ?? 0,
      };
    },
  });
}

export function usePortalInvoices() {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.invoices(scope ?? undefined),
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_portal_invoices");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalInvoice(invoiceId: string | undefined) {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.invoice(invoiceId, scope ?? undefined),
    enabled: !!user && !!scope && !!invoiceId,
    staleTime: 60_000,
    queryFn: async (): Promise<PortalInvoiceRow | null> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc("get_portal_invoice", { p_invoice_id: invoiceId });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as PortalInvoiceRow | null;
    },
  });
}

export function usePortalInvoicesPage(page: number, pageSize = 25, onlyBalance = false) {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  const { safePage, safeSize, from } = pageBounds(page, pageSize);
  return useQuery({
    queryKey: [...portalKeys.invoices(scope ?? undefined), "page", safePage, safeSize, onlyBalance] as const,
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async (): Promise<PortalPage<PortalInvoiceRow>> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc("get_portal_invoices_page", {
        p_page_size: safeSize,
        p_offset: from,
        p_only_balance: onlyBalance,
      });
      if (error) throw error;
      return parseRpcPage<PortalInvoiceRow>(data);
    },
  });
}

export function usePortalContracts() {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.contracts(scope ?? undefined),
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data, error }, forkliftMap] = await Promise.all([
        supabase.rpc("get_portal_contracts"),
        fetchForkliftsBriefMap(),
      ]);
      if (error) throw error;
      return (data ?? []).map((c) => ({
        ...c,
        forklifts: c.forklift_id ? forkliftMap.get(c.forklift_id) ?? null : null,
      }));
    },
  });
}

export function usePortalContractsPage(page: number, pageSize = 25) {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  const { safePage, safeSize, from } = pageBounds(page, pageSize);
  return useQuery({
    queryKey: [...portalKeys.contracts(scope ?? undefined), "page", safePage, safeSize] as const,
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async (): Promise<PortalPage<PortalContractRow>> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const [{ data, error }, forkliftMap] = await Promise.all([
        rpc("get_portal_contracts_page", { p_page_size: safeSize, p_offset: from }),
        fetchForkliftsBriefMap(),
      ]);
      if (error) throw error;
      const pageResult = parseRpcPage<PortalContractBase>(data);
      return {
        rows: pageResult.rows.map((contract) => ({
          ...contract,
          forklifts: contract.forklift_id ? forkliftMap.get(contract.forklift_id) ?? null : null,
        })),
        totalCount: pageResult.totalCount,
      };
    },
  });
}

export function usePortalPayments() {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.payments(scope ?? undefined),
    enabled: !!user && !!scope,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(PORTAL_PAYMENT_COLUMNS)
        .order("payment_date", { ascending: false })
        .returns<PortalPaymentRow[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalInvoicePayments(invoiceId: string | undefined, enabled = true) {
  // Las claves del portal incluyen la organización verificada: el mismo
  // cliente global puede existir en otra empresa y no debe compartir caché.
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return useQuery({
    queryKey: portalKeys.invoicePayments(invoiceId, scope ?? undefined),
    enabled: !!user && !!invoiceId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(PORTAL_PAYMENT_COLUMNS)
        .eq("invoice_id", invoiceId ?? "")
        .order("payment_date", { ascending: false })
        .returns<PortalPaymentRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}
