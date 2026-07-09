import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { CLABE_REGEX, isValidClabe } from "@/lib/schemas/common";
import type { Database } from "@/integrations/supabase/types";

export type SupplierBankAccount = Database["public"]["Tables"]["supplier_bank_accounts"]["Row"];
type Insert = Database["public"]["Tables"]["supplier_bank_accounts"]["Insert"];
type Update = Database["public"]["Tables"]["supplier_bank_accounts"]["Update"];

// Re-export para preservar los consumidores actuales; la fuente canónica vive
// en `@/lib/schemas/common`.
export { CLABE_REGEX, isValidClabe };

export function maskClabe(clabe: string | null): string {
  if (!clabe) return "—";
  const trimmed = clabe.trim();
  if (trimmed.length < 4) return trimmed;
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

export function maskClabe(clabe: string | null): string {
  if (!clabe) return "—";
  const trimmed = clabe.trim();
  if (trimmed.length < 4) return trimmed;
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}
  const trimmed = clabe.trim();
  if (trimmed.length < 4) return trimmed;
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

export function useSupplierBankAccounts(supplierId: string | undefined) {
  return useQuery({
    queryKey: ["supplier_bank_accounts", supplierId],
    enabled: Boolean(supplierId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!supplierId) return [];
      const { data, error } = await supabase
        .from("supplier_bank_accounts")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("is_primary", { ascending: false })
        .order("bank_name");
      if (error) throw error;
      return data as SupplierBankAccount[];
    },
  });
}

async function clearPrimary(supplierId: string, exceptId?: string) {
  const q = supabase
    .from("supplier_bank_accounts")
    .update({ is_primary: false })
    .eq("supplier_id", supplierId)
    .eq("is_primary", true);
  if (exceptId) q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw error;
}

export function useCreateSupplierBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Insert) => {
      if (input.is_primary && input.supplier_id) await clearPrimary(input.supplier_id);
      const { data, error } = await supabase
        .from("supplier_bank_accounts")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_bank_accounts", vars.supplier_id] });
      notifySuccess("Cuenta bancaria agregada");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo crear la cuenta bancaria" }),
  });
}

export function useUpdateSupplierBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplier_id, patch }: { id: string; supplier_id: string; patch: Update }) => {
      if (patch.is_primary === true) await clearPrimary(supplier_id, id);
      const { error } = await supabase.from("supplier_bank_accounts").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_bank_accounts", vars.supplier_id] });
      notifySuccess("Cuenta bancaria actualizada");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo actualizar la cuenta bancaria" }),
  });
}

export function useDeleteSupplierBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplier_id: _s }: { id: string; supplier_id: string }) => {
      const { error } = await supabase.from("supplier_bank_accounts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_bank_accounts", vars.supplier_id] });
      notifySuccess("Cuenta bancaria eliminada");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo eliminar la cuenta bancaria" }),
  });
}
