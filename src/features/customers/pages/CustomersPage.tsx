import { useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "react-router";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { SwipeableCard } from "@/components/feedback/SwipeableCard";
import { ChevronRightIcon, AddIcon, PhoneIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Card, CardContent } from "@/components/ui/card";
import { usePageActions } from "@/contexts/pageActions";
import { useUpdateProspect } from "@/features/crm";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CustomerFormDialog } from "../components/customers/CustomerFormDialog";
import { CustomersActions, CustomersFilters } from "../components/customers/CustomersToolbar";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "../hooks/customers/useCustomers";
import { useCustomersColumns } from "../hooks/customers/useCustomersColumns";
import { buildCustomerPayload, getE2ECustomerMetadata } from "../lib/customerPayload";
import type { CustomerFormData } from "../lib/customerFormSchema";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

export default function CustomersPage() {
  const { data: customers, isLoading, refetch } = useCustomers();
  const navigate = useNavigateTransition();
  const isMobile = useIsTabletOrBelow();
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
  useEffect(() => {
    // Prefill mount-only desde URL search params. `useEffectEvent` aisla los setters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runProspectPrefill();
  }, [runProspectPrefill]);


  const { values, set, reset, hasActive, filtered } = useTableFilters<Customer, {
    q: { type: "text"; fields: (keyof Customer)[] };
  }>({
    items: customers ?? [],
    facets: { q: { type: "text", fields: ["name", "company", "email"] as (keyof Customer)[] } },
  });


  const columns = useCustomersColumns();

  const table = useLiftgoTable<Customer>({
    data: filtered,
    columns,
    getRowId: (c) => c.id,
    initialSorting: [{ id: "name", desc: false }],
  });

  const paginatedItems = table.getRowModel().rows.map((r) => r.original);

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(c) => c.id}
      emptyMessage="No se encontraron clientes"
      renderCard={(c) => (
        <SwipeableCard
          onClick={() => navigate(`/customers/${c.id}`)}
          rightActions={c.phone ? [{
            label: "Llamar",
            icon: PhoneIcon,
            className: "bg-primary",
            onAction: () => { window.location.href = `tel:${c.phone}`; },
          }] : []}
        >
          <Card className="active:scale-[0.98] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{c.name}</span>
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              {c.rfc && <p className="text-xs font-mono text-muted-foreground">{c.rfc}</p>}
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                {c.phone && <span>{c.phone}</span>}
                {c.email && <span>{c.email}</span>}
              </div>
            </CardContent>
          </Card>
        </SwipeableCard>
      )}
    />
  ) : undefined;

  const openCreate = () => { setEditId(null); setInitialData(undefined); setDialogOpen(true); };

  usePageActions({ onNew: openCreate, onRefresh: refetch, newLabel: "Nuevo cliente" });

  const handleCreateSuccess = (newCustomer: { id?: string } | null | undefined) => {
    notifySuccess("Cliente agregado");
    setDialogOpen(false);
    if (!prospectId || !newCustomer?.id) return;
    updateProspect.mutate({ id: prospectId, customer_id: newCustomer.id });
    setProspectId(null);
    notifySuccess("Prospecto vinculado al nuevo cliente");
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
        subtitle={`${customers?.length || 0} clientes`}
        actions={<CustomersActions filtered={filtered} onCreate={openCreate} />}
        mobileFab={
          <button
            type="button"
            onClick={openCreate}
            aria-label="Agregar cliente"
            className="h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground flex items-center justify-center"
          >
            <AddIcon className="h-6 w-6" />
          </button>
        }
        filters={<CustomersFilters search={values.q} onSearchChange={(v) => set("q", v)} hasActive={hasActive} onClear={reset} />}
        isLoading={isLoading}
        table={table}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        emptyMessage="No se encontraron clientes"
        customContent={mobileContent}
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
