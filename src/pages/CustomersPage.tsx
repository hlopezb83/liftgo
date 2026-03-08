import { useState, useEffect } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "@/hooks/useCustomers";
import type { Customer } from "@/hooks/useCustomers";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/satCatalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { useSort } from "@/hooks/useSort";
import { PlusCircle, Edit, Eye, Download, ChevronRight } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { customerFormSchema, type CustomerFormData } from "@/lib/formSchemas";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePagination } from "@/hooks/usePagination";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUpdateProspect } from "@/hooks/useProspects";

const emptyCustomer: CustomerFormData = {
  name: "", email: "", phone: "", address: "", notes: "",
  website: "", contact_person: "", billing_address: "",
  rfc: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "",
  representante_legal: "",
};

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers();
  const navigate = useNavigate();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { form, set, setForm, reset } = useFormState(emptyCustomer);

  const filtered = customers?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(filtered, {
    defaultKey: "name",
    accessors: {
      name: (c) => c.name,
      rfc: (c) => c.rfc || "",
      email: (c) => c.email || "",
      phone: (c) => c.phone || "",
      contact_person: (c) => c.contact_person || "",
    },
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(sortedItems);
  const isMobile = useIsMobile();

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

  const openCreate = () => { setEditId(null); reset(); setDialogOpen(true); };
  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      name: c.name, email: c.email || "", phone: c.phone || "",
      address: c.address || "", notes: c.notes || "",
      website: c.website || "", contact_person: c.contact_person || "",
      billing_address: c.billing_address || "",
      rfc: c.rfc || "", regimen_fiscal: c.regimen_fiscal || "",
      uso_cfdi: c.uso_cfdi || "", domicilio_fiscal_cp: c.domicilio_fiscal_cp || "",
      representante_legal: c.representante_legal || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = customerFormSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const payload = {
      name: form.name, company: form.name, email: form.email || null, phone: form.phone || null,
      address: form.address || null, notes: form.notes || null,
      website: form.website || null,
      contact_person: form.contact_person || null, billing_address: form.billing_address || null,
      rfc: form.rfc || null, regimen_fiscal: form.regimen_fiscal || null,
      uso_cfdi: form.uso_cfdi || null, domicilio_fiscal_cp: form.domicilio_fiscal_cp || null,
      representante_legal: form.representante_legal || null,
    };

    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Cliente actualizado"); setDialogOpen(false); } });
    } else {
      createCustomer.mutate(payload, { onSuccess: () => { toast.success("Cliente agregado"); setDialogOpen(false); reset(); } });
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
            <TableHead className="w-16"></TableHead>
          </TableRow>
        }
        renderRow={(c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="font-mono text-xs">{c.rfc || "—"}</TableCell>
            <TableCell>{c.email || "—"}</TableCell>
            <TableCell>{c.phone || "—"}</TableCell>
            <TableCell>{c.contact_person || "—"}</TableCell>
            <TableCell className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/customers/${c.id}`)}><Eye className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(c as Customer)}><Edit className="h-4 w-4" /></Button>
            </TableCell>
          </TableRow>
        )}
        customContent={mobileContent}
        skeletonColumns={6}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar Cliente" : "Agregar Cliente"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Identidad</p>
              <div className="space-y-1.5">
                <Label>Nombre / Empresa *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Montacargas del Norte S.A." />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Datos Fiscales (CFDI)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>RFC</Label>
                  <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
                </div>
                <div className="space-y-1.5">
                  <Label>C.P. Fiscal</Label>
                  <Input value={form.domicilio_fiscal_cp} onChange={(e) => set("domicilio_fiscal_cp", e.target.value)} placeholder="06600" maxLength={5} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Régimen Fiscal</Label>
                  <Select value={form.regimen_fiscal} onValueChange={(v) => set("regimen_fiscal", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {REGIMEN_FISCAL.map((r) => (
                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Uso CFDI</Label>
                  <Select value={form.uso_cfdi} onValueChange={(v) => set("uso_cfdi", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {USO_CFDI.map((u) => (
                        <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Contacto</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Persona de Contacto</Label><Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="María García" /></div>
                <div className="space-y-1.5"><Label>Representante Legal (opcional)</Label><Input value={form.representante_legal} onChange={(e) => set("representante_legal", e.target.value)} placeholder="Lic. Juan Pérez" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Correo</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contacto@empresa.com" /></div>
                <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+52 55 1234 5678" /></div>
              </div>
              <div className="space-y-1.5"><Label>Sitio Web</Label><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" /></div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Direcciones</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Dirección</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Av. Reforma 123" /></div>
                <div className="space-y-1.5"><Label>Dirección de Facturación</Label><Input value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} placeholder="Calle Facturación 456" /></div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Interno</p>
              <div className="space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notas adicionales..." rows={3} /></div>
            </div>

            <FormActions submitLabel={editId ? "Guardar Cambios" : "Agregar Cliente"} isPending={createCustomer.isPending || updateCustomer.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
