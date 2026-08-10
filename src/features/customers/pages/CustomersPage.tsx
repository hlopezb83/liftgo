import { useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "react-router";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { AddIcon, UsersIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { usePageActions } from "@/contexts/pageActions";
import { useUpdateProspect } from "@/features/crm";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { visibleListRows } from "@/lib/supabase/constants";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CustomerFormDialog } from "../components/customers/CustomerFormDialog";
import { CustomerMobileCard } from "../components/customers/CustomerMobileCard";
import { CustomersActions, CustomersFilters } from "../components/customers/CustomersToolbar";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "../hooks/customers/useCustomers";
import { useCustomersColumns } from "../hooks/customers/useCustomersColumns";
import { buildCustomerPayload, getE2ECustomerMetadata } from "../lib/customerPayload";
import type { CustomerFormData } from "../lib/customerFormSchema";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

export default function CustomersPage() {
  const { data: customersRaw, isLoading, isError, refetch } = useCustomers();
  const customers = visibleListRows(customersRaw);
  const navigate = useNavigateTransition();
  const [searchParams, setSearchParams] = useSearchParams();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const updateProspect = useUpdateProspect();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Partial<CustomerFormData> | undefined>();

  // Auto-open dialog with pre-filled data from prospect conversion.
  // `runProspectPrefill` es useEffectEvent → lee siempre los searchParams frescos
  // y llama a los setters estables sin necesidad de listarlos en las deps.
  const runProspectPrefill = useEffectEvent(() => {
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
    if (searchParams.get("new") !== "1") return;
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
  }, []);


  const { values, set, reset, hasActive, filtered } = useTableFilters<Customer, {
    q: { type: "text"; fields: (keyof Customer)[] };
  }>({
    items: customers ?? [],
    facets: { q: { type: "text", fields: ["name", "company", "email", "rfc"] as (keyof Customer)[] } },
  });


  const columns = useCustomersColumns();

  const table = useLiftgoTable<Customer>({
    data: filtered,
    columns,
    getRowId: (c) => c.id,
    initialSorting: [{ id: "name", desc: false }],
  });

  const renderMobileCard = (c: Customer) => (
    <CustomerMobileCard customer={c} onOpen={(id) => navigate(`/customers/${id}`)} />
  );

  const openCreate = () => { setEditId(null); setInitialData(undefined); setDialogOpen(true); };

  usePageActions({ onNew: openCreate, onRefresh: refetch, newLabel: "Nuevo cliente" });

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
        subtitle={customers ? `${customers.length} clientes` : undefined}
        actions={<CustomersActions filtered={filtered} onCreate={openCreate} />}
        mobileFab={
          <RoleGuard module="Clientes" minAccess="full" fallback={null}>
            <button
              type="button"
              onClick={openCreate}
              aria-label="Agregar cliente"
              className="h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground flex items-center justify-center"
            >
              <AddIcon className="h-6 w-6" />
            </button>
          </RoleGuard>
        }
        notice={
          <ListTruncationNotice rows={customersRaw} />
        }
        filters={
          <div className="space-y-3">
            <CustomersFilters search={values.q} onSearchChange={(v) => set("q", v)} hasActive={hasActive} onClear={reset} />
          </div>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyIcon={UsersIcon}
        emptyMessage="No se encontraron clientes"
        emptyActionLabel="Nuevo cliente"
        onEmptyAction={openCreate}
        mobileCardRender={renderMobileCard}
        mobileKeyExtractor={(c) => c.id}
        skeletonColumns={6}
      />


      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={initialData}
        isEdit={!!editId}
        isPending={createCustomer.isPending || updateCustomer.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
