import { useMemo, useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { PlusCircle, DownloadIcon, ChevronRightIcon, SupplierIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageActions } from "@/contexts/pageActions";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { exportToCsv } from "@/lib/exportCsv";
import { Link } from "@/lib/router-compat-ui";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { SupplierFormDialog } from "../components/suppliers/SupplierFormDialog";
import { useSuppliersIncremental, SUPPLIER_CATEGORIES } from "../hooks/useSuppliers";
import type { Supplier } from "../hooks/useSuppliers";

function renderSupplierActions(showExport: boolean, showCreate: boolean, onExport: () => void, onCreate: () => void) {
  if (!showExport && !showCreate) return null;
  return (
    <div className="flex gap-2">
      {showExport && <Button variant="outline" size="sm" onClick={onExport}>
        <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
      </Button>}
      {showCreate && <RoleGuard module="Proveedores" minAccess="full" fallback={null}>
        <Button onClick={onCreate} size="sm">
          <PlusCircle className="h-4 w-4 mr-1" />Nuevo proveedor
        </Button>
      </RoleGuard>}
    </div>
  );
}

export default function SuppliersPage() {
  const supplierPages = useSuppliersIncremental();
  const { isLoading, isError, refetch } = supplierPages;
  const suppliers = useMemo(() => supplierPages.data?.pages.flatMap((page) => page.slice(0, LIST_PAGE_LIMIT)) ?? [], [supplierPages.data]);
  const navigate = useNavigateTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const canWrite = useHasModuleAccess("Proveedores", "full");

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
  const showEmptyCreate = !isLoading && !isError && suppliers.length === 0 && !hasActive;
  const showExport = suppliers.length > 0 && !supplierPages.hasNextPage;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  usePageActions({ onNew: canWrite ? openCreate : undefined, newLabel: canWrite ? "Nuevo proveedor" : undefined });



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
        subtitle={supplierPages.hasNextPage ? `${suppliers.length}+ proveedores cargados` : `${suppliers.length} proveedores registrados`}
        notice={
          supplierPages.hasNextPage ? <p className="text-xs text-muted-foreground">La búsqueda incluye los proveedores cargados. Usa «Cargar más» para ampliar la lista; la exportación estará disponible al cargar todos.</p> : null
        }
        actions={renderSupplierActions(showExport, canWrite && !showEmptyCreate, handleExport, openCreate)}
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
        isError={isError}
        hasMoreRows={supplierPages.hasNextPage}
        loadMore={{ hasMore: supplierPages.hasNextPage, isLoading: supplierPages.isFetchingNextPage,
          onClick: () => { void supplierPages.fetchNextPage(); }, loaded: suppliers.length }}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyIcon={SupplierIcon}
        emptyMessage="No se encontraron proveedores"
        emptyActionLabel={canWrite ? "Nuevo proveedor" : undefined}
        onEmptyAction={canWrite ? openCreate : undefined}
        mobileCardRender={(s) => (
          <Link
            to={`/suppliers/${s.id}`}
            aria-label={`Ver proveedor ${s.name}`}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card>
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
          </Link>
        )}
      />

      {canWrite && <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editing} />}
    </>
  );
}
