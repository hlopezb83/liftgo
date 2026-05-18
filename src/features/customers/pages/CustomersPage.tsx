import { useState, useEffect } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "@/features/customers/hooks/customers/useCustomers";
import type { Customer } from "@/features/customers/hooks/customers/useCustomers";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useListPage } from "@/hooks/useListPage";
import { useListFilters } from "@/hooks/useListFilters";
import { PlusCircle, Download, ChevronRight } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpdateProspect } from "@/hooks/useProspects";
import { CustomerFormDialog } from "@/features/customers/components/customers/CustomerFormDialog";
import type { CustomerFormData } from "@/lib/formSchemas";

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers();
  const navigate = useNavigate();
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

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    defaultSortKey: "name",
    accessors: {
      name: (c) => c.name,
      rfc: (c) => c.rfc || "",
      email: (c) => c.email || "",
      phone: (c) => c.phone || "",
      contact_person: (c) => c.contact_person || "",
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(c) => c.id}
      emptyMessage="No se encontraron clientes"
      renderCard={(c) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/customers/${c.id}`)}>
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
      )}
    />
  ) : undefined;

  const openCreate = () => { setEditId(null); setInitialData(undefined); setDialogOpen(true); };

  const handleSubmit = (form: CustomerFormData) => {
    const payload = {
      name: form.name, company: form.name, email: form.email || null, phone: form.phone || null,
      address: form.address || null, notes: form.notes || null,
      website: form.website || null,
      contact_person: form.contact_person || null,
      rfc: form.rfc || null, razon_social: form.razon_social || null, regimen_fiscal: form.regimen_fiscal || null,
      uso_cfdi: form.uso_cfdi || null, domicilio_fiscal_cp: form.domicilio_fiscal_cp || null,
      representante_legal: form.representante_legal || null,
    };

    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Cliente actualizado"); setDialogOpen(false); } });
    } else {
      createCustomer.mutate(payload, {
        onSuccess: (newCustomer) => {
          toast.success("Cliente agregado");
          setDialogOpen(false);
          if (prospectId && newCustomer?.id) {
            updateProspect.mutate({ id: prospectId, customer_id: newCustomer.id });
            setProspectId(null);
            toast.success("Prospecto vinculado al nuevo cliente");
          }
        },
      });
    }
  };

  return (
    <>
      <ListPageLayout
        title="Clientes"
        subtitle={`${customers?.length || 0} clientes`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("clientes.csv", (filtered || []).map(c => ({ Nombre: c.name, Correo: c.email || "", Teléfono: c.phone || "", Contacto: c.contact_person || "", Dirección: c.address || "" })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <Button onClick={openCreate} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Agregar Cliente</Button>
          </div>
        }
        filters={
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar clientes..." />
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron clientes"
        tableHeader={
          <TableRow>
            <SortableTableHead sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Nombre</SortableTableHead>
            <SortableTableHead sortKey="rfc" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>RFC</SortableTableHead>
            <SortableTableHead sortKey="email" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Correo</SortableTableHead>
            <SortableTableHead sortKey="phone" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Teléfono</SortableTableHead>
            <SortableTableHead sortKey="contact_person" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Persona de Contacto</SortableTableHead>
          </TableRow>
        }
        renderRow={(c) => (
          <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50 transition-colors border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/customers/${c.id}`)}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="font-mono text-xs">{c.rfc || "—"}</TableCell>
            <TableCell>{c.email || "—"}</TableCell>
            <TableCell>{c.phone || "—"}</TableCell>
            <TableCell>{c.contact_person || "—"}</TableCell>
          </TableRow>
        )}
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
