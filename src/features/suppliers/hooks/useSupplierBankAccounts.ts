import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { CLABE_REGEX, isValidClabe } from "@/lib/schemas";
import { supplierBankAccountKeys } from "../lib/queryKeys";

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

export const supplierBankAccountQueries = defineEntityQueries<
  "supplier_bank_accounts",
  SupplierBankAccount[],
  never
>("supplier_bank_accounts", {
  list: (filter) => async () => {
    const supplierId = filter?.supplierId as string | undefined;
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

export function useSupplierBankAccounts(supplierId: string | undefined) {
  return useQuery({
    ...supplierBankAccountQueries.list({ supplierId: supplierId ?? null }),
    enabled: Boolean(supplierId),
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
  return useEntityMutation({
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
    invalidateKeys: [supplierBankAccountKeys.all],
    successMsg: "Cuenta bancaria agregada",
    errorTitle: "No se pudo crear la cuenta bancaria",
  });
}

export function useUpdateSupplierBankAccount() {
  return useEntityMutation({
    mutationFn: async ({ id, supplier_id, patch }: { id: string; supplier_id: string; patch: Update }) => {
      if (patch.is_primary === true) await clearPrimary(supplier_id, id);
      const { error } = await supabase.from("supplier_bank_accounts").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierBankAccountKeys.all],
    successMsg: "Cuenta bancaria actualizada",
    errorTitle: "No se pudo actualizar la cuenta bancaria",
  });
}

export function useDeleteSupplierBankAccount() {
  return useEntityMutation({
    mutationFn: async ({ id }: { id: string; supplier_id: string }) => {
      const { error } = await supabase.from("supplier_bank_accounts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierBankAccountKeys.all],
    successMsg: "Cuenta bancaria eliminada",
    errorTitle: "No se pudo eliminar la cuenta bancaria",
  });
}
