/**
 * Mutaciones de clientes (sin lecturas de cartera).
 *
 * El alta crea la identidad; la edición modifica la relación comercial local.
 * El navegador nunca envía `organization_id`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { customerKeys } from "../../lib/queryKeys";

export function useCreateCustomer() {
  return useEntityMutation({
    mutationFn: async (customer: TablesInsert<"customers">) => {
      const { data, error } = await supabase.from("customers").insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al crear cliente",
  });
}

/**
 * La edición cambia únicamente la relación comercial de esta empresa.
 * updated_at actúa como versión optimista de esa relación.
 */
export function useUpdateCustomer() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedUpdatedAt, ...updates }: TablesUpdate<"customers"> & {
      id: string;
      expectedUpdatedAt?: string | null;
    }) => {
      const relationUpdates = {
        alias: updates.name,
        razon_social: updates.razon_social,
        rfc: updates.rfc,
        regimen_fiscal: updates.regimen_fiscal,
        uso_cfdi: updates.uso_cfdi,
        domicilio_fiscal_cp: updates.domicilio_fiscal_cp,
        representante_legal: updates.representante_legal,
        contact_person: updates.contact_person,
        email: updates.email,
        phone: updates.phone,
        billing_address: updates.address,
        tax_rate: updates.tax_rate,
        notes: updates.notes,
        website: updates.website,
        updated_at: new Date().toISOString(),
      };
      // RLS restringe el UPDATE a organization_id de la sesión, sin aceptar
      // un id de empresa enviado por el navegador.
      let q = supabase.from("organization_customers")
        .update(relationUpdates).eq("customer_id", id).eq("status", "active");
      if (expectedUpdatedAt != null) q = q.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await q.select();

      if (error) throw error;
      if ((!data || data.length === 0) && expectedUpdatedAt != null) {
        const { data: still } = await supabase
          .from("organization_customers").select("updated_at")
          .eq("customer_id", id).eq("status", "active").maybeSingle();
        if (still && still.updated_at !== expectedUpdatedAt) {
          throw new Error("stale_write: otro usuario modificó este cliente; recarga y vuelve a intentar");
        }
      }
      assertRowsAffected(data, "Actualizar cliente");
      return data[0];
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al actualizar cliente",
  });
}

export function useDeleteCustomer(opts?: {
  /** Bloqueos de negocio del backend (saldo pendiente, rentas activas). */
  onBusinessBlock?: (block: BusinessBlock) => void;
}) {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      // Soft delete: preserva historial de facturas y bookings
      const { error } = await supabase.rpc("soft_delete_customer", { p_customer_id: id });
      if (error) throw error;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al archivar cliente",
    ...(opts?.onBusinessBlock
      ? { onBusinessBlock: (block: BusinessBlock) => opts.onBusinessBlock?.(block) }
      : {}),
  });
}
