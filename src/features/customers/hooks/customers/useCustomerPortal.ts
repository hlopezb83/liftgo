import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { portalKeys } from "../../lib/queryKeys";

export function usePortalCustomer() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portalKeys.customer(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

type ForkliftBrief = { id: string; name: string | null; model: string | null; manufacturer: string | null };

async function fetchForkliftsBriefMap(): Promise<Map<string, ForkliftBrief>> {
  const { data, error } = await supabase.rpc("get_customer_forklifts_brief");
  if (error) throw error;
  const map = new Map<string, ForkliftBrief>();
  (data ?? []).forEach((f: ForkliftBrief) => map.set(f.id, f));
  return map;
}

export function usePortalBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portalKeys.bookings(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data, error }, forkliftMap] = await Promise.all([
        supabase
          .from("bookings")
          .select("*")
          .order("start_date", { ascending: false }),
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

export function usePortalInvoices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portalKeys.invoices(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_portal_invoices");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalContracts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portalKeys.contracts(user?.id),
    enabled: !!user,
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

export function usePortalPayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portalKeys.payments(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, invoices(invoice_number)")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
