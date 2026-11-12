import { queryOptions, useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supplierBillKeys } from "@/features/accounts-payable";
import { maintenanceLogQueries } from "@/features/maintenance";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { e2eVisibilityFilter, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";

export type SupplierLinkedBill = Pick<Tables<"supplier_bills">,
  "id" | "supplier_id" | "organization_id" | "issue_date" | "category" | "description" | "total" | "currency" | "exchange_rate" | "status"
>;
export type SupplierLinkedMaintenance = Pick<Tables<"maintenance_logs">,
  "id" | "supplier_id" | "organization_id" | "forklift_id" | "performed_at" | "service_type" | "cost"
> & { forklifts: { name: string } | null };

type SupplierRow = { supplier_id: string | null; organization_id: string | null };

// Publish a total only after every scoped page succeeds. A failed later page
// must never turn a partial history into an apparently complete balance.
async function readSupplierPages<T extends SupplierRow>(
  supplierId: string | undefined,
  organizationId: string | undefined,
  signal: AbortSignal,
  readPage: (from: number, supplier: string, organization: string) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (!supplierId || !organizationId) throw new Error("No se pudo verificar el proveedor y su empresa.");
  const rows: T[] = [];
  for (let from = 0; ; from += LIST_PAGE_LIMIT) {
    signal.throwIfAborted();
    const { data, error } = await readPage(from, supplierId, organizationId);
    signal.throwIfAborted();
    if (error) throw error;
    const page = data ?? [];
    if (page.some(row => row.supplier_id !== supplierId || row.organization_id !== organizationId)) {
      throw new Error("El historial recibido no corresponde al proveedor de esta empresa.");
    }
    rows.push(...page);
    if (page.length < LIST_PAGE_LIMIT) return rows;
  }
}

export function supplierLinkedBillsOptions(supplierId: string | undefined, organizationId: string | undefined) {
  return queryOptions({
    queryKey: supplierBillKeys.byFilter({ scope: "supplier-detail", supplierId, organizationId }),
    enabled: Boolean(supplierId && organizationId),
    staleTime: 30_000,
    queryFn: ({ signal }) => readSupplierPages<SupplierLinkedBill>(supplierId, organizationId, signal, (from, supplier, organization) => supabase
      .from("supplier_bills")
      .select("id, supplier_id, organization_id, issue_date, category, description, total, currency, exchange_rate, status")
      .eq("supplier_id", supplier)
      .eq("organization_id", organization)
      .neq("status", "cancelled")
      .order("issue_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + LIST_PAGE_LIMIT - 1)
      .abortSignal(signal)
      .returns<SupplierLinkedBill[]>()),
  });
}

export function supplierLinkedMaintenanceOptions(supplierId: string | undefined, organizationId: string | undefined) {
  return queryOptions({
    queryKey: maintenanceLogQueries.keys.byFilter({ scope: "supplier-detail", supplierId, organizationId }),
    enabled: Boolean(supplierId && organizationId),
    staleTime: 60_000,
    queryFn: ({ signal }) => readSupplierPages<SupplierLinkedMaintenance>(supplierId, organizationId, signal, (from, supplier, organization) => supabase
      .from("maintenance_logs")
      .select("id, supplier_id, organization_id, forklift_id, performed_at, service_type, cost, forklifts(name)")
      .eq("supplier_id", supplier)
      .eq("organization_id", organization)
      .is("deleted_at", null)
      .or(e2eVisibilityFilter())
      .order("performed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + LIST_PAGE_LIMIT - 1)
      .abortSignal(signal)
      .returns<SupplierLinkedMaintenance[]>()),
  });
}

export function useSupplierLinkedBills(supplierId: string | undefined) {
  const organization = useOrganizationContext();
  const query = useQuery(supplierLinkedBillsOptions(supplierId,
    organization.status === "ready" ? organization.organizationId : undefined));
  return {
    ...query,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "ready" && organization.status !== "loading") || query.isError,
  };
}

export function useSupplierLinkedMaintenance(supplierId: string | undefined) {
  const organization = useOrganizationContext();
  const query = useQuery(supplierLinkedMaintenanceOptions(supplierId,
    organization.status === "ready" ? organization.organizationId : undefined));
  return {
    ...query,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "ready" && organization.status !== "loading") || query.isError,
  };
}
