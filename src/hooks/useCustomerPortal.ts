import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function usePortalCustomer() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_customer", user?.id],
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

export function usePortalBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_bookings", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalInvoices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_invoices", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalContracts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_contracts", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, forklifts(name, model)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalPayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_payments", user?.id],
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

