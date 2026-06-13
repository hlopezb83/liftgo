import { useState, useEffect } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "@/features/customers/hooks/customers/useCustomers";
import { Card, CardContent } from "@/components/ui/card";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { SwipeableCard } from "@/components/feedback/SwipeableCard";
import { useListFilters } from "@/hooks/useListFilters";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { ChevronRight, Plus, Phone } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpdateProspect } from "@/features/crm/hooks/useProspects";
import { CustomerFormDialog } from "@/features/customers/components/customers/CustomerFormDialog";
import { usePageActions } from "@/contexts/PageActionsContext";
import { CustomersActions, CustomersFilters } from "@/features/customers/components/customers/CustomersToolbar";
import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";
import { buildCustomerPayload, getE2ECustomerMetadata } from "@/features/customers/lib/customerPayload";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { useCustomersColumns } from "@/features/customers/hooks/customers/useCustomersColumns";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

export default function CustomersPage() {
  const { data: customers, isLoading, refetch } = useCustomers();
  const navigate = useNavigate();
  const isMobile = useIsTabletOrBelow();
  const [searchParams, setSearchParams] = useSearchParams();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const updateProspect = useUpdateProspect();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Partial<CustomerFormData> | undefined>();

  // Auto-open dialog with pre-filled data from prospect conversion
  useEffect(() => {
    if (searchParams.get("from_prospect") === "true") {
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
    }
    // Solo se ejecuta una vez al montar para leer query params iniciales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { search, setSearch, filtered } = useListFilters(customers, {
    searchFields: ["name", "company", "email"],
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
            icon: Phone,
            className: "bg-primary",
            onAction: () => { window.location.href = `tel:${c.phone}`; },
          }] : []}
        >
          <Card className="active:scale-[0.98] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{c.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
    toast.success("Cliente agregado");
    setDialogOpen(false);
    if (!prospectId || !newCustomer?.id) return;
    updateProspect.mutate({ id: prospectId, customer_id: newCustomer.id });
    setProspectId(null);
    toast.success("Prospecto vinculado al nuevo cliente");
  };

  const handleSubmit = (form: CustomerFormData) => {
    const payload = buildCustomerPayload(form);
    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, {
        onSuccess: () => { toast.success("Cliente actualizado"); setDialogOpen(false); },
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
            <Plus className="h-6 w-6" />
          </button>
        }
        filters={<CustomersFilters search={search} onSearchChange={setSearch} />}
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
