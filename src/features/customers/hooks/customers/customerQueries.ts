/**
 * Lecturas de la cartera de clientes (sin mutaciones).
 *
 * La identidad de `customers` se combina con la relación comercial visible
 * para la empresa actual (`organization_customers`).
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
  "id, name, company, rfc, email, phone, contact_person, address, razon_social, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_rate, created_by_organization_id"
);

// M-11a: `version` es indispensable para el bloqueo optimista del formulario
// de edición (trigger `bump_version_optimistic` la incrementa en cada UPDATE).
const CUSTOMER_DETAIL_COLUMNS = sel(
  "id, name, company, email, phone, address, notes, website, contact_person, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, tax_rate, tax_id, user_id, version, created_at, updated_at, created_by_organization_id"
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

export type Customer = Tables<"customers"> & { relation_updated_at?: string };

type CustomerRelationRow = Pick<Tables<"organization_customers">,
  "alias" | "razon_social" | "rfc" | "regimen_fiscal" | "uso_cfdi" |
  "domicilio_fiscal_cp" | "representante_legal" | "contact_person" |
  "email" | "phone" | "billing_address" | "tax_rate" | "notes" |
  "updated_at" | "organization_id"
> & { website?: string | null; customers: Customer };

const RELATION_COLUMNS = "organization_id, alias, razon_social, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal, contact_person, email, phone, billing_address, tax_rate, notes, website, updated_at";

/** La identidad es compartida; la ficha comercial y fiscal pertenece a cada empresa. */
export function mergeCustomerRelation(row: CustomerRelationRow): Customer {
  const customer = row.customers;
  const name = row.alias ?? customer.name;
  const ownsIdentity = row.organization_id === customer.created_by_organization_id;
  return {
    ...customer,
    name,
    company: name,
    razon_social: row.razon_social ?? customer.razon_social,
    rfc: row.rfc ?? customer.rfc,
    regimen_fiscal: row.regimen_fiscal,
    uso_cfdi: row.uso_cfdi,
    domicilio_fiscal_cp: row.domicilio_fiscal_cp,
    representante_legal: row.representante_legal,
    contact_person: row.contact_person,
    email: row.email,
    phone: row.phone,
    address: row.billing_address,
    tax_rate: row.tax_rate,
    notes: row.notes,
    website: row.website ?? (ownsIdentity ? customer.website : null),
    relation_updated_at: row.updated_at,
  };
}

const unwrapRelation = (rows: CustomerRelationRow[] | null): Customer[] =>
  (rows ?? []).filter((row) => row.customers != null).map(mergeCustomerRelation);

export const customerQueries = defineEntityQueries<"customers", Customer[], Customer | null>(
  "customers",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("organization_customers")
        .select(`status, ${RELATION_COLUMNS}, customers!inner(${CUSTOMER_LIST_COLUMNS})`)
        .eq(ACTIVE_RELATION_FILTER.column, ACTIVE_RELATION_FILTER.value)
        .is("customers.deleted_at", null)
        .or("is_e2e.is.null,is_e2e.eq.false", { referencedTable: "customers" })
        .not("customers.name", "ilike", "E2E%")
        .or("email.is.null,email.neq.e2e-ui@test.local", { referencedTable: "customers" })
        .order("customers(name)")
        .limit(LIST_FETCH_LIMIT)
        .returns<CustomerRelationRow[]>();
      if (error) throw error;
      return unwrapRelation(data);
    },
    detail: (id) => async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("organization_customers")
        .select(`status, ${RELATION_COLUMNS}, customers!inner(${CUSTOMER_DETAIL_COLUMNS})`)
        .eq("customer_id", id)
        .eq(ACTIVE_RELATION_FILTER.column, ACTIVE_RELATION_FILTER.value)
        .is("customers.deleted_at", null)
        .maybeSingle()
        .returns<CustomerRelationRow>();
      if (error) throw error;
      return data?.customers ? mergeCustomerRelation(data) : null;
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
