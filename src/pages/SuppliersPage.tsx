import { useState } from "react";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, SUPPLIER_CATEGORIES } from "@/hooks/useSuppliers";
import type { Supplier } from "@/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { FormActions } from "@/components/FormActions";
import { useListPage } from "@/hooks/useListPage";
import { PlusCircle, Download, ChevronRight } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { REGIMEN_FISCAL } from "@/lib/satCatalogs";
import { RoleGuard } from "@/components/RoleGuard";

interface SupplierForm {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  rfc: string;
  regimen_fiscal: string;
  category: string;
  notes: string;
}

const emptyForm: SupplierForm = {
  name: "", contact_person: "", email: "", phone: "", website: "",
  address: "", rfc: "", regimen_fiscal: "", category: "", notes: "",
};

const CATEGORIES = Object.entries(SUPPLIER_CATEGORIES);

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const navigate = useNavigate();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const setField = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const filtered = (suppliers || []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.rfc || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.contact_person || "").toLowerCase().includes(q)
    );
  });

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: {
      name: (s) => s.name,
      rfc: (s) => s.rfc || "",
      category: (s) => s.category || "",
      email: (s) => s.email || "",
      phone: (s) => s.phone || "",
    },
  });

  const openCreate = () => { setForm(emptyForm); setEditId(null); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({
      name: s.name, contact_person: s.contact_person || "", email: s.email || "",
      phone: s.phone || "", website: s.website || "", address: s.address || "",
      rfc: s.rfc || "", regimen_fiscal: s.regimen_fiscal || "",
      category: s.category || "", notes: s.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      address: form.address || null,
      rfc: form.rfc || null,
      regimen_fiscal: form.regimen_fiscal || null,
      category: form.category || null,
      notes: form.notes || null,
    };
    if (editId) {
      updateSupplier.mutate({ id: editId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createSupplier.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleExport = () => {
    exportToCsv("proveedores.csv", (suppliers || []).map((s) => ({
      Nombre: s.name, RFC: s.rfc || "", Categoría: SUPPLIER_CATEGORIES[s.category || ""] || s.category || "",
      Correo: s.email || "", Teléfono: s.phone || "", Contacto: s.contact_person || "",
    })));
  };

  return (
    <>
      <ListPageLayout
        title="Proveedores"
        subtitle={`${suppliers?.length || 0} proveedores registrados`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <RoleGuard module="Proveedores" minAccess="full">
              <Button onClick={openCreate} size="sm"><PlusCircle className="h-4 w-4 mr-1" />Nuevo Proveedor</Button>
            </RoleGuard>
          </div>
        }
        filters={<SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, RFC, correo…" />}
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron proveedores"
        tableHeader={
          <TableRow>
            <SortableTableHead sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Nombre</SortableTableHead>
            <SortableTableHead sortKey="rfc" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>RFC</SortableTableHead>
            <SortableTableHead sortKey="category" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Categoría</SortableTableHead>
            <SortableTableHead sortKey="email" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Correo</SortableTableHead>
            <SortableTableHead sortKey="phone" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Teléfono</SortableTableHead>
          </TableRow>
        }
        renderRow={(s) => (
          <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/suppliers/${s.id}`)}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell className="font-mono text-sm">{s.rfc || "—"}</TableCell>
            <TableCell>
              {s.category ? <Badge variant="outline">{SUPPLIER_CATEGORIES[s.category] || s.category}</Badge> : "—"}
            </TableCell>
            <TableCell>{s.email || "—"}</TableCell>
            <TableCell>{s.phone || "—"}</TableCell>
          </TableRow>
        )}
        customContent={isMobile ? (
          <MobileCardList
            items={paginatedItems}
            keyExtractor={(s) => s.id}
            emptyMessage="No se encontraron proveedores"
            renderCard={(s) => (
              <Card className="cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{s.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {s.category && <Badge variant="outline" className="mb-1">{SUPPLIER_CATEGORIES[s.category] || s.category}</Badge>}
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    {s.rfc && <p className="font-mono">{s.rfc}</p>}
                    {s.email && <p>{s.email}</p>}
                    {s.phone && <p>{s.phone}</p>}
                  </div>
                </CardContent>
              </Card>
            )}
          />
        ) : undefined}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
            {/* Identidad */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nombre del proveedor" />
              </div>
              <div className="space-y-1.5">
                <Label>Persona de Contacto</Label>
                <Input value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Datos Fiscales */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium text-muted-foreground">Datos Fiscales</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>RFC</Label>
                  <Input value={form.rfc} onChange={(e) => setField("rfc", e.target.value)} placeholder="XAXX010101000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Régimen Fiscal</Label>
                  <Select value={form.regimen_fiscal} onValueChange={(v) => setField("regimen_fiscal", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {REGIMEN_FISCAL.map((r) => <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Contacto */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium text-muted-foreground">Contacto</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Correo</Label>
                  <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sitio Web</Label>
                <Input value={form.website} onChange={(e) => setField("website", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => setField("address", e.target.value)} />
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5 border-t pt-3">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
            </div>

            <DialogFooter>
              <FormActions
                submitLabel={editId ? "Guardar" : "Crear"}
                isPending={createSupplier.isPending || updateSupplier.isPending}
                onCancel={() => setDialogOpen(false)}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
