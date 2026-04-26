import { useState } from "react";
import { useSuppliers, SUPPLIER_CATEGORIES } from "@/hooks/useSuppliers";
import type { Supplier } from "@/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useListPage } from "@/hooks/useListPage";
import { PlusCircle, Download, ChevronRight } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { RoleGuard } from "@/components/RoleGuard";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

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

  const openCreate = () => { setEditing(null); setDialogOpen(true); };

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

      <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editing} />
    </>
  );
}
