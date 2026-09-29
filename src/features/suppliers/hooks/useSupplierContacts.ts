import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { supplierContactKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const SUPPLIER_CONTACT_COLUMNS = sel(
  "id, supplier_id, name, email, phone, role, is_primary, notes, created_at, updated_at"
);

export type SupplierContact = Database["public"]["Tables"]["supplier_contacts"]["Row"];
type SupplierContactValues = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  is_primary: boolean;
};

export const SUPPLIER_CONTACT_ROLES = [
  "Principal",
  "Cobranza",
  "Ventas",
  "Almacén",
  "Operaciones",
  "Dirección",
  "Otro",
] as const;

export const supplierContactQueries = defineEntityQueries<
  "supplier_contacts",
  SupplierContact[],
  never
>("supplier_contacts", {
  list: (filter) => async () => {
    const supplierId = filter?.supplierId as string | undefined;
    if (!supplierId) return [];
    const { data, error } = await supabase
      .from("supplier_contacts")
      .select(SUPPLIER_CONTACT_COLUMNS)
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false })
      .order("name")
      .returns<SupplierContact[]>();
    if (error) throw error;
    return data ?? [];
  },
});

export function useSupplierContacts(supplierId: string | undefined) {
  return useQuery({
    ...supplierContactQueries.list({ supplierId: supplierId ?? null }),
    enabled: Boolean(supplierId),
  });
}

export function useCreateSupplierContact() {
  return useEntityMutation({
    mutationFn: async (input: SupplierContactValues & { supplier_id: string }) => {
      const { data, error } = await supabase.rpc("save_supplier_contact", {
        p_supplier_id: input.supplier_id,
        p_contact_id: null,
        p_name: input.name,
        p_email: input.email,
        p_phone: input.phone,
        p_role: input.role,
        p_notes: input.notes,
        p_is_primary: input.is_primary,
      });
      if (error) throw error;
      return { id: data };
    },
    invalidateKeys: [supplierContactKeys.all],
    successMsg: "Contacto agregado",
    errorTitle: "No se pudo crear el contacto",
  });
}

export function useUpdateSupplierContact() {
  return useEntityMutation({
    mutationFn: async ({
      id,
      supplier_id,
      values,
    }: {
      id: string;
      supplier_id: string;
      values: SupplierContactValues;
    }) => {
      const { data, error } = await supabase.rpc("save_supplier_contact", {
        p_supplier_id: supplier_id,
        p_contact_id: id,
        p_name: values.name,
        p_email: values.email,
        p_phone: values.phone,
        p_role: values.role,
        p_notes: values.notes,
        p_is_primary: values.is_primary,
      });
      if (error) throw error;
      return data;
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
