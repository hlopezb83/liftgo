import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useVerifiedPortalCustomerId } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { portalKeys } from "../../lib/queryKeys";
import type {
  ForkliftBrief,
  PortalBookingRow,
  PortalContractBase,
  PortalContractRow,
  PortalCustomerRow,
  PortalInvoiceRow,
  PortalPage,
  PortalPaymentRow,
  RpcPagePayload,
  UntypedRpc,
} from "./customerPortal.types";

const sel = (s: string): string => s;

const PORTAL_CUSTOMER_COLUMNS = sel("id, name, rfc, domicilio_fiscal_cp");
const PORTAL_BOOKING_COLUMNS = sel("id, forklift_id, start_date, end_date, status");
// v7.216.0 (C6): columnas explícitas — sólo las que consume la UI del portal
// (PortalStatement, PortalInvoiceDetail, PortalInvoicePayment).
const PORTAL_PAYMENT_COLUMNS = sel(
  "id, invoice_id, payment_date, payment_method, reference_number, amount, invoices(invoice_number)",
);

type PortalBookingBase = Pick<PortalBookingRow, "id" | "forklift_id" | "start_date" | "end_date" | "status">;

function parseRpcPage<T>(data: unknown): PortalPage<T> {
  const payload = (data ?? {}) as RpcPagePayload<T>;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalCount: Number(payload.total_count ?? 0),
  };
}

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

/**
 * Las claves del portal incluyen la organización verificada: el mismo cliente
 * global puede existir en otra empresa y no debe compartir caché.
 */
function usePortalScope() {
  const user = useAuth().user;
  const scope = useVerifiedIdentityScope();
  return { user, scope };
}

export function usePortalCustomer() {
  const { user, scope } = usePortalScope();
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

export function usePortalBookings() {
  const { user, scope } = usePortalScope();
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
          .returns<PortalBookingBase[]>(),
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
  const { user, scope } = usePortalScope();
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
          .returns<PortalBookingBase[]>(),
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
  const { user, scope } = usePortalScope();
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
