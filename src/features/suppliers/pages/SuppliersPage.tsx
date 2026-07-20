import { useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { PlusCircle, DownloadIcon, ChevronRightIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageActions } from "@/contexts/pageActions";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { exportToCsv } from "@/lib/exportCsv";
import { SupplierFormDialog } from "../components/suppliers/SupplierFormDialog";
import { useSuppliers, SUPPLIER_CATEGORIES } from "../hooks/useSuppliers";
import type { Supplier } from "../hooks/useSuppliers";

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const navigate = useNavigateTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { values, set, reset, hasActive, filtered } = useTableFilters<
    Supplier,
    { q: { type: "text"; fields: (keyof Supplier)[] } }
  >({
    items: suppliers ?? [],
    facets: {
      q: { type: "text", fields: ["name", "rfc", "email", "contact_person"] },
    },
  });


  const columns: ColumnDef<Supplier>[] = [
    {
      id: "name",
      header: "Nombre",
      accessorKey: "name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "rfc",
      header: "RFC",
      accessorFn: (s) => s.rfc || "",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.rfc || "—"}</span>,
    },
    {
      id: "category",
      header: "Categoría",
      accessorFn: (s) => s.category || "",
      cell: ({ row }) =>
        row.original.category ? (
          <Badge variant="outline">
            {SUPPLIER_CATEGORIES[row.original.category] || row.original.category}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "email",
      header: "Correo",
      accessorFn: (s) => s.email || "",
      cell: ({ row }) => row.original.email || "—",
    },
    {
      id: "phone",
      header: "Teléfono",
      accessorFn: (s) => s.phone || "",
      cell: ({ row }) => row.original.phone || "—",
    },
  ];

  const table = useLiftgoTable<Supplier>({
    data: filtered,
    columns,
    getRowId: (s) => s.id,
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  usePageActions({ onNew: openCreate, newLabel: "Nuevo proveedor" });



  const handleExport = () => {
    exportToCsv(
      "proveedores.csv",
      (suppliers || []).map((s) => ({
        Nombre: s.name,
        RFC: s.rfc || "",
        Categoría: SUPPLIER_CATEGORIES[s.category || ""] || s.category || "",
        Correo: s.email || "",
        Teléfono: s.phone || "",
        Contacto: s.contact_person || "",
      })),
    );
  };

  return (
    <>
      <ListPageLayout
        title="Proveedores"
        subtitle={`${suppliers?.length || 0} proveedores registrados`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
            </Button>
            <RoleGuard module="Proveedores" minAccess="full">
              <Button onClick={openCreate} size="sm">
                <PlusCircle className="h-4 w-4 mr-1" />Nuevo Proveedor
              </Button>
            </RoleGuard>
          </div>
        }
        filters={
          <FiltersToolbar>
            <FiltersToolbar.Search
              value={values.q}
              onChange={(v) => set("q", v)}
              placeholder="Buscar por nombre, RFC, correo…"
            />
            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyMessage="No se encontraron proveedores"
        mobileCardRender={(s) => (
          <Card className="cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">{s.name}</span>
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              {s.category && (
                <Badge variant="outline" className="mb-1">
                  {SUPPLIER_CATEGORIES[s.category] || s.category}
                </Badge>
              )}
              <div className="text-sm text-muted-foreground space-y-0.5">
                {s.rfc && <p className="font-mono">{s.rfc}</p>}
                {s.email && <p>{s.email}</p>}
                {s.phone && <p>{s.phone}</p>}
              </div>
            </CardContent>
          </Card>
        )}
      />

      <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editing} />
    </>
  );
}
