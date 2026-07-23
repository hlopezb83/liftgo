import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_PAGE_LIMIT, hasReachedListLimit } from "@/lib/supabase/constants";
import { customerKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

// Nota: el listado se usa como fuente para prellenar formularios de factura,
// cotización y contrato. Debe incluir los campos fiscales (razón social, RFC,
// régimen, uso CFDI, CP fiscal), dirección y representante legal para que el
// auto-fill no borre datos previamente cargados. Ver hallazgos QA v7.163.x.
const CUSTOMER_LIST_COLUMNS = sel(
  "id, name, company, rfc, email, phone, contact_person, address, razon_social, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal"
);

const CUSTOMER_DETAIL_COLUMNS = sel(
  "id, name, company, email, phone, address, notes, website, contact_person, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_id, user_id, created_at, updated_at"
);

export type Customer = Tables<"customers">;

export const customerQueries = defineEntityQueries<"customers", Customer[], Customer | null>(
  "customers",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(CUSTOMER_LIST_COLUMNS)
        .is("deleted_at", null)
        .or("is_e2e.is.null,is_e2e.eq.false")
        .not("name", "ilike", "E2E%")
        .or("email.is.null,email.neq.e2e-ui@test.local")
        .order("name")
        .limit(LIST_PAGE_LIMIT)
        .returns<Customer[]>();
      if (error) throw error;
      if (hasReachedListLimit(data)) {
        console.warn(
          `[useCustomers] Alcanzó LIST_PAGE_LIMIT (${LIST_PAGE_LIMIT}). Migrar a paginación server-side.`,
        );
      }
      return data ?? [];
    },
    detail: (id) => async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("customers")
        .select(CUSTOMER_DETAIL_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle()
        .returns<Customer>();
      if (error) throw error;
      return data;
    },
  },
);

export function useCustomers() {
  return useQuery(customerQueries.list());
}

/**
 * Detalle por id — consulta directa por PK.
 * Evita depender de `useCustomers()` (que está limitado y podría no incluir al cliente buscado).
 */
export function useCustomer(id: string | undefined) {
  return useQuery({
    ...customerQueries.detail(id ?? ""),
    enabled: !!id,
    staleTime: 60_000,
  });
}

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

export function useUpdateCustomer() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"customers"> & { id: string }) => {
      // R10 Bloque 12.7: no actualizar clientes archivados.
      const { data, error } = await supabase.from("customers").update(updates).eq("id", id).is("deleted_at", null).select().single();

      if (error) throw error;
      return data;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al actualizar cliente",
  });
}

export function useDeleteCustomer() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      // Soft delete: preserva historial de facturas y bookings
      const { error } = await supabase.rpc("soft_delete_customer", { p_customer_id: id });
      if (error) throw error;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al archivar cliente",
  });
}
