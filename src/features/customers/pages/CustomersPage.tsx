import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { AddIcon, UsersIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { useLocation, useSearchParams } from "@/lib/router-compat";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CustomerFormDialog } from "../components/CustomerFormDialog";
import { CustomerMobileCard } from "../components/CustomerMobileCard";
import { CustomersActions, CustomersFilters, CustomersSecondaryActions } from "../components/CustomersToolbar";
import { useCustomersIncremental } from "../hooks/customerQueries";
import { useCustomers, useCreateCustomerWithProspectLink, useUpdateCustomer } from "../hooks/useCustomers";
import { useCustomersColumns } from "../hooks/useCustomersColumns";
import { buildCustomerPayload, getE2ECustomerMetadata } from "../lib/customerPayload";
import type { CustomerFormData } from "../lib/customerFormSchema";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];
const EMPTY_CUSTOMERS: Customer[] = [];
const CUSTOMER_FACETS = {
  q: { type: "text" as const, fields: ["name", "company", "email", "phone", "contact_person", "rfc"] as (keyof Customer)[] },
};

function renderCustomerMobileCard(customer: Customer, open: (id: string) => void) {
  return <CustomerMobileCard customer={customer} onOpen={open} />;
}

function useCustomerNavigation() {
  const navigate = useNavigateTransition();
  const location = useLocation();
  const state = { customerListBackTo: `${location.pathname}${location.search}${location.hash}` };
  const open = (id: string) => navigate(`/customers/${id}`, { state });
  return { open, table: {
    onRowClick: (customer: Customer) => open(customer.id),
    rowAction: { columnId: "name", label: (customer: Customer) => `Ver cliente ${customer.name}`,
      to: (customer: Customer) => `/customers/${customer.id}`, state: () => state },
  } };
}

function useCustomerUrlPrefill(
  canWrite: boolean,
  onOpenFromProspect: (prospectId: string | null, data: Partial<CustomerFormData>) => void,
  onOpenQuickCreate: () => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  // Auto-open dialog with pre-filled data from prospect conversion.
  // `runProspectPrefill` es useEffectEvent → lee siempre los searchParams frescos
  // y llama a los setters estables sin necesidad de listarlos en las deps.
  const runProspectPrefill = useEffectEvent(() => {
    if (!canWrite || searchParams.get("from_prospect") !== "true") return;
    onOpenFromProspect(searchParams.get("prospect_id"), {
      name: searchParams.get("company") || "",
      contact_person: searchParams.get("contact") || "",
      email: searchParams.get("email") || "",
      phone: searchParams.get("phone") || "",
    });
    setSearchParams({}, { replace: true });
  });
  // Oleada 1 sidebar: `+ Nuevo` navega a /customers?new=1 y aquí lo consumimos.
  const runQuickCreatePrefill = useEffectEvent(() => {
    if (!canWrite || searchParams.get("new") !== "1") return;
    onOpenQuickCreate();
    searchParams.delete("new");
    setSearchParams(searchParams, { replace: true });
  });
  useEffect(() => {
    runProspectPrefill();
    runQuickCreatePrefill();
  }, [canWrite, searchKey]);
}

export default function CustomersPage() {
  const customerPages = useCustomersIncremental();
  const { isLoading, isError, refetch } = customerPages;
  const customers = useMemo(
    () => customerPages.data?.pages.flatMap((page) => page.slice(0, LIST_PAGE_LIMIT)) ?? EMPTY_CUSTOMERS,
    [customerPages.data],
  );
  const customerNavigation = useCustomerNavigation();
  const createCustomer = useCreateCustomerWithProspectLink();
  const updateCustomer = useUpdateCustomer();
  const canWrite = useHasModuleAccess("Clientes", "full");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Partial<CustomerFormData> | undefined>();

  useCustomerUrlPrefill(
    canWrite,
    (pId, data) => { setProspectId(pId); setEditId(null); setInitialData(data); setDialogOpen(true); },
    () => { setProspectId(null); setEditId(null); setInitialData(undefined); setDialogOpen(true); },
  );

  const { values, set, reset, hasActive, filtered } = useTableFilters<Customer, typeof CUSTOMER_FACETS>({
    items: customers,
    facets: CUSTOMER_FACETS,
  });


  const columns = useCustomersColumns();

  const table = useLiftgoTable<Customer>({
    ...useTableViewState(filtered.length, [{ id: "name", desc: false }]),
    data: filtered,
    columns,
    getRowId: (c) => c.id,
    initialSorting: [{ id: "name", desc: false }],
  });

  const openCreate = () => {
    if (!canWrite) return;
    setProspectId(null);
    setEditId(null);
    setInitialData(undefined);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setProspectId(null);
  };

  usePageActions({
    onNew: canWrite ? openCreate : undefined,
    onRefresh: refetch,
    newLabel: canWrite ? "Nuevo cliente" : undefined,
  });

  const handleSubmit = (form: CustomerFormData) => {
    const payload = buildCustomerPayload(form);
    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, {
        onSuccess: () => { notifySuccess("Cliente actualizado"); setDialogOpen(false); },
      });
      return;
    }
    const linkedProspectId = prospectId;
    createCustomer.mutate(
      { customer: { ...payload, ...getE2ECustomerMetadata() }, prospectId: linkedProspectId },
      {
        onSuccess: () => {
          notifySuccess("Cliente agregado");
          if (linkedProspectId) notifySuccess("Prospecto vinculado al nuevo cliente");
          setDialogOpen(false);
          setProspectId(null);
        },
      },
    );
  };

  return (
    <>
      <ListPageLayout
        onRefresh={refetch}
        title="Clientes"
        subtitle={customerPages.hasNextPage ? `${customers.length}+ clientes cargados` : `${customers.length} clientes`}
        actions={<CustomersActions filtered={isLoading || isError ? undefined : filtered} onCreate={openCreate} exportDisabled={customerPages.hasNextPage} />}
        mobileActions={<CustomersSecondaryActions filtered={isLoading || isError ? undefined : filtered} exportDisabled={customerPages.hasNextPage} />}
        mobilePrimaryAction={
          <RoleGuard module="Clientes" minAccess="full" fallback={null}>
            <Button
              size="sm"
              onClick={openCreate}
              aria-label="Agregar cliente"
            >
              <AddIcon className="h-4 w-4" />Nuevo cliente
            </Button>
          </RoleGuard>
        }
        notice={
          customerPages.hasNextPage ? <p className="text-xs text-muted-foreground">La búsqueda incluye los clientes cargados. Usa «Cargar más» para ampliar la lista; la exportación estará disponible al cargar todos.</p> : null
        }
        search={
          <div className="w-full max-w-[45rem]">
            <CustomersFilters search={values.q} onSearchChange={(v) => set("q", v)} hasActive={hasActive} onClear={reset} />
          </div>
        }
        isLoading={isLoading}
        isError={isError} error={customerPages.error}
        hasMoreRows={customerPages.hasNextPage}
        loadMore={{ hasMore: customerPages.hasNextPage, isLoading: customerPages.isFetchingNextPage,
          onClick: () => { void customerPages.fetchNextPage(); }, loaded: customers.length }}
        onRetry={() => { void refetch(); }}
        table={table}
        {...customerNavigation.table}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyIcon={UsersIcon}
        emptyMessage="No se encontraron clientes"
        emptyActionLabel={canWrite ? "Nuevo cliente" : undefined}
        onEmptyAction={canWrite ? openCreate : undefined}
        mobileCardRender={(customer) => renderCustomerMobileCard(customer, customerNavigation.open)}
        mobileKeyExtractor={(c) => c.id}
        skeletonColumns={6}
      />


      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        initialData={initialData}
        isEdit={!!editId}
        isPending={createCustomer.isPending || updateCustomer.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
