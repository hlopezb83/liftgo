import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { supplierContactKeys } from "../lib/queryKeys";
import type { Database } from "@/integrations/supabase/types";

export type SupplierContact = Database["public"]["Tables"]["supplier_contacts"]["Row"];
type Insert = Database["public"]["Tables"]["supplier_contacts"]["Insert"];
type Update = Database["public"]["Tables"]["supplier_contacts"]["Update"];

export const SUPPLIER_CONTACT_ROLES = [
  "Principal",
  "Cobranza",
  "Ventas",
  "Almacén",
  "Operaciones",
  "Dirección",
  "Otro",
] as const;

export function useSupplierContacts(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierContactKeys.detail(supplierId ?? "none"),
    enabled: Boolean(supplierId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!supplierId) return [];
      const { data, error } = await supabase
        .from("supplier_contacts")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as SupplierContact[];
    },
  });
}

async function clearPrimary(supplierId: string, exceptId?: string) {
  const q = supabase
    .from("supplier_contacts")
    .update({ is_primary: false })
    .eq("supplier_id", supplierId)
    .eq("is_primary", true);
  if (exceptId) q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw error;
}

export function useCreateSupplierContact() {
  return useEntityMutation({
    mutationFn: async (input: Insert) => {
      if (input.is_primary && input.supplier_id) {
        await clearPrimary(input.supplier_id);
      }
      const { data, error } = await supabase
        .from("supplier_contacts")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [supplierContactKeys.all],
    successMsg: "Contacto agregado",
    errorTitle: "No se pudo crear el contacto",
  });
}

export function useUpdateSupplierContact() {
  return useEntityMutation({
    mutationFn: async ({ id, supplier_id, patch }: { id: string; supplier_id: string; patch: Update }) => {
      if (patch.is_primary === true) {
        await clearPrimary(supplier_id, id);
      }
      const { error } = await supabase.from("supplier_contacts").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierContactKeys.all],
    successMsg: "Contacto actualizado",
    errorTitle: "No se pudo actualizar el contacto",
  });
}

export function useDeleteSupplierContact() {
  return useEntityMutation({
    mutationFn: async ({ id }: { id: string; supplier_id: string }) => {
      const { error } = await supabase.from("supplier_contacts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierContactKeys.all],
    successMsg: "Contacto eliminado",
    errorTitle: "No se pudo eliminar el contacto",
  });
}
