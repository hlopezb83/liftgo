import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { customerKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

// Nota: el listado se usa como fuente para prellenar formularios de factura,
// cotización y contrato. Debe incluir los campos fiscales (razón social, RFC,
// régimen, uso CFDI, CP fiscal), dirección y representante legal para que el
// auto-fill no borre datos previamente cargados. Ver hallazgos QA v7.163.x.
const CUSTOMER_LIST_COLUMNS = sel(
  "id, name, company, rfc, email, phone, contact_person, address, razon_social, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal"
);

// M-11a: `version` es indispensable para el bloqueo optimista del formulario
// de edición (trigger `bump_version_optimistic` la incrementa en cada UPDATE).
const CUSTOMER_DETAIL_COLUMNS = sel(
  "id, name, company, email, phone, address, notes, website, contact_person, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_id, user_id, version, created_at, updated_at"
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
        .limit(LIST_FETCH_LIMIT)
        .returns<Customer[]>();
      if (error) throw error;
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

/**
 * M-11a: bloqueo optimista. El llamador envía `expectedVersion` — el valor de
 * `version` que tenía el registro CUANDO se abrió el formulario. Si otro
 * usuario guardó en el intermedio, el trigger `bump_version_optimistic` ya
 * incrementó la columna, el UPDATE afecta 0 filas y abortamos en vez de pisar
 * los cambios ajenos (lost update). Sin `expectedVersion` se conserva el
 * comportamiento anterior (sin bloqueo) para no romper flujos internos.
 */
export function useUpdateCustomer() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedVersion, ...updates }: TablesUpdate<"customers"> & {
      id: string;
      expectedVersion?: number | null;
    }) => {
      // R10 Bloque 12.7: no actualizar clientes archivados.
      let q = supabase.from("customers").update(updates).eq("id", id).is("deleted_at", null);
      if (expectedVersion != null) q = q.eq("version", expectedVersion);
      const { data, error } = await q.select();

      if (error) throw error;
      if ((!data || data.length === 0) && expectedVersion != null) {
        // Distinguir conflicto de concurrencia de "sin permisos / archivado".
        const { data: still } = await supabase
          .from("customers").select("version").eq("id", id).is("deleted_at", null).maybeSingle();
        // FIX R6-11: conflicto real solo si la versión cambió; si coincide, el
        // UPDATE falló por RLS/permisos y no hay que reportar un falso
        // stale_write (patrón R5-17 de facturas).
        if (still && still.version !== expectedVersion) {
          throw new Error("stale_write: otro usuario modificó este cliente; recarga y vuelve a intentar");
        }
      }
      // GUI-FE-08: 0 filas = sin permisos (RLS) o registro archivado/inexistente.
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
