import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { AddIcon, UsersIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useUpdateProspect } from "@/features/crm";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { useSearchParams } from "@/lib/router-compat";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CustomerFormDialog } from "../components/customers/CustomerFormDialog";
import { CustomerMobileCard } from "../components/customers/CustomerMobileCard";
import { CustomersActions, CustomersFilters, CustomersSecondaryActions } from "../components/customers/CustomersToolbar";
import { useCustomersIncremental } from "../hooks/customers/customerQueries";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "../hooks/customers/useCustomers";
import { useCustomersColumns } from "../hooks/customers/useCustomersColumns";
import { buildCustomerPayload, getE2ECustomerMetadata } from "../lib/customerPayload";
import type { CustomerFormData } from "../lib/customerFormSchema";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

function renderCustomerMobileCard(customer: Customer, open: (id: string) => void) {
  return <CustomerMobileCard customer={customer} onOpen={open} />;
}

export default function CustomersPage() {
  const customerPages = useCustomersIncremental();
  const { isLoading, isError, refetch } = customerPages;
  const customers = useMemo(() => customerPages.data?.pages.flatMap((page) => page.slice(0, LIST_PAGE_LIMIT)) ?? [], [customerPages.data]);
  const navigate = useNavigateTransition();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const updateProspect = useUpdateProspect();
  const canWrite = useHasModuleAccess("Clientes", "full");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Partial<CustomerFormData> | undefined>();

  // Auto-open dialog with pre-filled data from prospect conversion.
  // `runProspectPrefill` es useEffectEvent → lee siempre los searchParams frescos
  // y llama a los setters estables sin necesidad de listarlos en las deps.
  const runProspectPrefill = useEffectEvent(() => {
    if (!canWrite) return;
    if (searchParams.get("from_prospect") !== "true") return;
    const pId = searchParams.get("prospect_id");
    setProspectId(pId);
    setEditId(null);
    setInitialData({
      name: searchParams.get("company") || "",
      contact_person: searchParams.get("contact") || "",
      email: searchParams.get("email") || "",
      phone: searchParams.get("phone") || "",
    });
    setDialogOpen(true);
    setSearchParams({}, { replace: true });
  });
  // Oleada 1 sidebar: `+ Nuevo` navega a /customers?new=1 y aquí lo consumimos.
  const runQuickCreatePrefill = useEffectEvent(() => {
    if (!canWrite) return;
    if (searchParams.get("new") !== "1") return;
    setProspectId(null);
    setEditId(null);
    setInitialData(undefined);
    setDialogOpen(true);
    searchParams.delete("new");
    setSearchParams(searchParams, { replace: true });
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runProspectPrefill();
    runQuickCreatePrefill();
  }, [canWrite, searchKey]);


  const { values, set, reset, hasActive, filtered } = useTableFilters<Customer, {
    q: { type: "text"; fields: (keyof Customer)[] };
  }>({
    items: customers ?? [],
    facets: { q: { type: "text", fields: ["name", "company", "email", "phone", "contact_person", "rfc"] as (keyof Customer)[] } },
  });


  const columns = useCustomersColumns();

  const table = useLiftgoTable<Customer>({
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

  const handleCreateSuccess = (newCustomer: { id?: string } | null | undefined) => {
    notifySuccess("Cliente agregado");
    setDialogOpen(false);
    if (!prospectId || !newCustomer?.id) return;
    // FIX-FE-06: el toast se muestra en onSuccess — antes era optimista y se
    // celebraba una vinculación que podía fallar (fire-and-forget).
    updateProspect.mutate(
      { id: prospectId, customer_id: newCustomer.id },
      { onSuccess: () => notifySuccess("Prospecto vinculado al nuevo cliente") },
    );
    setProspectId(null);
  };

  const handleSubmit = (form: CustomerFormData) => {
    const payload = buildCustomerPayload(form);
    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, {
        onSuccess: () => { notifySuccess("Cliente actualizado"); setDialogOpen(false); },
      });
      return;
    }
    createCustomer.mutate({ ...payload, ...getE2ECustomerMetadata() }, { onSuccess: handleCreateSuccess });
  };

  return (
    <>
      <ListPageLayout
        onRefresh={refetch}
        title="Clientes"
        subtitle={customerPages.hasNextPage ? `${customers.length}+ clientes cargados` : `${customers.length} clientes`}
        actions={<CustomersActions filtered={filtered} onCreate={openCreate} exportDisabled={customerPages.hasNextPage} />}
        mobileActions={<CustomersSecondaryActions filtered={filtered} exportDisabled={customerPages.hasNextPage} />}
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
        isError={isError}
        hasMoreRows={customerPages.hasNextPage}
        loadMore={{ hasMore: customerPages.hasNextPage, isLoading: customerPages.isFetchingNextPage,
          onClick: () => { void customerPages.fetchNextPage(); }, loaded: customers.length }}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyIcon={UsersIcon}
        emptyMessage="No se encontraron clientes"
        emptyActionLabel={canWrite ? "Nuevo cliente" : undefined}
        onEmptyAction={canWrite ? openCreate : undefined}
        mobileCardRender={(customer) => renderCustomerMobileCard(customer, (id) => navigate(`/customers/${id}`))}
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
