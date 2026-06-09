import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
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
    queryKey: ["supplier_contacts", supplierId],
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
  const qc = useQueryClient();
  return useMutation({
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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_contacts", vars.supplier_id] });
      toast.success("Contacto agregado");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo crear el contacto" }),
  });
}

export function useUpdateSupplierContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplier_id, patch }: { id: string; supplier_id: string; patch: Update }) => {
      if (patch.is_primary === true) {
        await clearPrimary(supplier_id, id);
      }
      const { error } = await supabase.from("supplier_contacts").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_contacts", vars.supplier_id] });
      toast.success("Contacto actualizado");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo actualizar el contacto" }),
  });
}

export function useDeleteSupplierContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplier_id: _s }: { id: string; supplier_id: string }) => {
      const { error } = await supabase.from("supplier_contacts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supplier_contacts", vars.supplier_id] });
      toast.success("Contacto eliminado");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo eliminar el contacto" }),
  });
}
