/**
 * Lecturas de la cartera de clientes (sin mutaciones).
 *
 * Extraído de `useCustomers.ts` (Paquete 7) sin cambios de comportamiento:
 * mismas columnas, misma relación `organization_customers` + `customers!inner`,
 * mismos filtros de archivado/E2E, mismo límite y mismas query keys.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { customerKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

// Nota: el listado se usa como fuente para prellenar formularios de factura,
// cotización y contrato. Debe incluir los campos fiscales (razón social, RFC,
// régimen, uso CFDI, CP fiscal), dirección y representante legal para que el
// auto-fill no borre datos previamente cargados. Ver hallazgos QA v7.163.x.
const CUSTOMER_LIST_COLUMNS = sel(
  "id, name, company, rfc, email, phone, contact_person, address, razon_social, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_rate"
);

// M-11a: `version` es indispensable para el bloqueo optimista del formulario
// de edición (trigger `bump_version_optimistic` la incrementa en cada UPDATE).
const CUSTOMER_DETAIL_COLUMNS = sel(
  "id, name, company, email, phone, address, notes, website, contact_person, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_rate, tax_id, user_id, version, created_at, updated_at"
);

/**
 * Tramo 9 multiempresa: la cartera de clientes se lee a través de la relación
 * comercial (`organization_customers`) de la empresa del usuario, no del
 * catálogo global `customers`.
 *
 *  · `customers` es identidad global (RFC único): un mismo cliente puede
 *    tener relación con varias empresas.
 *  · La relación decide qué ve cada empresa y su estado de archivado: archivar
 *    un cliente compartido sólo archiva la relación (`status = 'archived'`)
 *    y no debe seguir apareciendo en esta empresa aunque `deleted_at` sea NULL.
 *  · RLS (`org_customers_select`) ya limita `organization_customers` a la
 *    empresa resuelta en servidor; el navegador nunca envía `organization_id`.
 */
const ACTIVE_RELATION_FILTER = { column: "status", value: "active" } as const;

type CustomerRelationRow<T> = { customers: T };

const unwrapRelation = <T,>(rows: CustomerRelationRow<T>[] | null): T[] =>
  (rows ?? []).map((row) => row.customers).filter((c): c is T => c != null);

export type Customer = Tables<"customers">;

export const customerQueries = defineEntityQueries<"customers", Customer[], Customer | null>(
  "customers",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("organization_customers")
        .select(`status, customers!inner(${CUSTOMER_LIST_COLUMNS})`)
        .eq(ACTIVE_RELATION_FILTER.column, ACTIVE_RELATION_FILTER.value)
        .is("customers.deleted_at", null)
        .or("is_e2e.is.null,is_e2e.eq.false", { referencedTable: "customers" })
        .not("customers.name", "ilike", "E2E%")
        .or("email.is.null,email.neq.e2e-ui@test.local", { referencedTable: "customers" })
        .order("customers(name)")
        .limit(LIST_FETCH_LIMIT)
        .returns<CustomerRelationRow<Customer>[]>();
      if (error) throw error;
      return unwrapRelation(data);
    },
    detail: (id) => async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("organization_customers")
        .select(`status, customers!inner(${CUSTOMER_DETAIL_COLUMNS})`)
        .eq("customer_id", id)
        .eq(ACTIVE_RELATION_FILTER.column, ACTIVE_RELATION_FILTER.value)
        .is("customers.deleted_at", null)
        .maybeSingle()
        .returns<CustomerRelationRow<Customer>>();
      if (error) throw error;
      return data?.customers ?? null;
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

export type CustomerPortalAccountStatus = "active" | "suspended" | "revoked";

export interface CustomerPortalAccountSummary {
  status: CustomerPortalAccountStatus;
  email: string;
}

/**
 * Tramo 9: el acceso al portal de un cliente es POR EMPRESA
 * (`customer_portal_accounts`), no el vínculo legado global `customers.user_id`.
 * RLS (`portal_accounts_select`) sólo devuelve cuentas de la empresa del
 * usuario; un cliente compartido puede tener acceso en otra empresa y aquí
 * seguir sin cuenta.
 */
export function useCustomerPortalAccount(customerId: string | undefined) {
  return useQuery({
    queryKey: customerKeys.portalAccount(customerId ?? ""),
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerPortalAccountSummary | null> => {
      if (!customerId) return null;
      const { data, error } = await supabase
        .from("customer_portal_accounts")
        .select("status, email")
        .eq("customer_id", customerId)
        .in("status", ["active", "suspended"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return { status: row.status as CustomerPortalAccountStatus, email: row.email };
    },
  });
}
