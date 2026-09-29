import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { CLABE_REGEX, isValidClabe } from "@/lib/schemas";
import { supplierBankAccountKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const SUPPLIER_BANK_ACCOUNT_COLUMNS = sel(
  "id, supplier_id, bank_name, account_holder, account_number, clabe, currency, notes, is_primary, created_at, updated_at"
);

export type SupplierBankAccount = Database["public"]["Tables"]["supplier_bank_accounts"]["Row"];
type SupplierBankAccountValues = {
  bank_name: string;
  account_holder: string;
  clabe: string | null;
  account_number: string | null;
  currency: SupplierBankAccount["currency"];
  notes: string | null;
  is_primary: boolean;
};

// Re-export para preservar los consumidores actuales; la fuente canónica vive
// en `@/lib/schemas/common`.
export { CLABE_REGEX, isValidClabe };

const PRIMARY_UNIQUE_INDEX = "supplier_bank_accounts_one_primary";

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Mensaje claro ante conflictos inesperados del índice único de cuenta primaria.
 * La función de base de datos serializa los cambios normales por proveedor.
 */
export function bankAccountMutationErrorMessage(error: Error): string {
  const message = error.message ?? "";
  if (errorCode(error) === "23505" && new RegExp(PRIMARY_UNIQUE_INDEX, "i").test(message)) {
    return "Ya existe una cuenta primaria para este proveedor. Actualiza la lista y desmarca la primaria actual antes de continuar.";
  }
  return message;
}

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
      .select(SUPPLIER_BANK_ACCOUNT_COLUMNS)
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false })
      .order("bank_name")
      .returns<SupplierBankAccount[]>();
    if (error) throw error;
    return data ?? [];
  },
});

export function useSupplierBankAccounts(supplierId: string | undefined) {
  return useQuery({
    ...supplierBankAccountQueries.list({ supplierId: supplierId ?? null }),
    enabled: Boolean(supplierId),
  });
}

export function useCreateSupplierBankAccount() {
  return useEntityMutation({
    mutationFn: async (input: SupplierBankAccountValues & { supplier_id: string }) => {
      const { data, error } = await supabase.rpc("save_supplier_bank_account", {
        p_supplier_id: input.supplier_id,
        p_account_id: null,
        p_bank_name: input.bank_name,
        p_account_holder: input.account_holder,
        p_clabe: input.clabe,
        p_account_number: input.account_number,
        p_currency: input.currency,
        p_notes: input.notes,
        p_is_primary: input.is_primary,
      });
      if (error) throw error;
      return { id: data };
    },
    invalidateKeys: [supplierBankAccountKeys.all],
    successMsg: "Cuenta bancaria agregada",
    errorTitle: "No se pudo crear la cuenta bancaria",
    errorMessage: bankAccountMutationErrorMessage,
  });
}

export function useUpdateSupplierBankAccount() {
  return useEntityMutation({
    mutationFn: async ({
      id,
      supplier_id,
      values,
    }: {
      id: string;
      supplier_id: string;
      values: SupplierBankAccountValues;
    }) => {
      const { data, error } = await supabase.rpc("save_supplier_bank_account", {
        p_supplier_id: supplier_id,
        p_account_id: id,
        p_bank_name: values.bank_name,
        p_account_holder: values.account_holder,
        p_clabe: values.clabe,
        p_account_number: values.account_number,
        p_currency: values.currency,
        p_notes: values.notes,
        p_is_primary: values.is_primary,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [supplierBankAccountKeys.all],
    successMsg: "Cuenta bancaria actualizada",
    errorTitle: "No se pudo actualizar la cuenta bancaria",
    errorMessage: bankAccountMutationErrorMessage,
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
