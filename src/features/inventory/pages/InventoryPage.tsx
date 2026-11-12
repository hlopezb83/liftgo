import { useEffect, useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { KpiTile } from "@/components/domain/KpiTile";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { SearchBar } from "@/components/forms/SearchBar";
import { AddIcon, InventoryIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useDialogState, useToggleDialog } from "@/hooks/useDialogState";
import { ActivatePartDialog } from "../components/inventory/ActivatePartDialog";
import { inventoryColumns } from "../components/inventory/inventoryColumns";
import { InventoryMobileCard } from "../components/inventory/InventoryRows";
import { PartDetailSheet } from "../components/inventory/PartDetailSheet";
import { PartFormDialog } from "../components/inventory/PartFormDialog";
import { useInventoryPage } from "../hooks/useInventoryPage";
import { useInventoryPart } from "../hooks/useInventoryPart";
import { type PartInventory } from "../hooks/usePartsInventory";
import { PART_CATEGORIES } from "../lib/partConstants";

function useInventoryListState() {
  const { values, set, reset, hasActive } = useTableFilters<PartInventory, {
    q: { type: "text"; fields: (keyof PartInventory)[] };
    category: { type: "enum"; field: keyof PartInventory; options: readonly string[] };
    stock: { type: "enum"; options: readonly string[] };
  }>({ mode: "server", facets: {
    q: { type: "text", fields: ["name", "sku"] },
    category: { type: "enum", field: "category", options: ["all", ...PART_CATEGORIES] },
    stock: { type: "enum", options: ["all", "low"] },
  } });
  const viewState = useTableViewState();
  const { controlledPagination: pagination, controlledSorting: sorting, onControlledPaginationChange } = viewState;
  const { data, isLoading, isError, refetch } = useInventoryPage({
    search: values.q, category: values.category, lowStockOnly: values.stock === "low", ...pagination, sorting,
  });
  useEffect(() => {
    if (data && data.pageIndex !== pagination.pageIndex) {
      onControlledPaginationChange({ ...pagination, pageIndex: data.pageIndex });
    }
  }, [data, pagination, onControlledPaginationChange]);

  const lowStockCount = isError ? 0 : data?.lowStockCount ?? 0;
  const totalCount = data?.totalCount;
  const items = data?.items;
  const pageCount = Math.ceil((totalCount ?? 0) / pagination.pageSize);
  return { values, set, reset, hasActive, viewState, items, pageCount, totalCount, isLoading, isError, refetch, lowStockCount };
}

export default function InventoryPage() {
  const canWrite = useHasModuleAccess("Refacciones", "full");
  const { values, set, reset, hasActive, viewState, items, pageCount, totalCount, isLoading, isError, refetch, lowStockCount } = useInventoryListState();

  const formDialog = useToggleDialog();
  const activateDialog = useToggleDialog();
  const [editing, setEditing] = useState<PartInventory | null>(null);
  const detail = useDialogState<PartInventory["id"]>();
  const selected = useInventoryPart(detail.isOpen ? detail.selected : null);
  const selectedPart = selected.isError ? null : selected.data;

  const openCreate = () => { if (!canWrite) return; setEditing(null); activateDialog.openDialog(); };
  const openEdit = (p: PartInventory) => { if (!canWrite) return; setEditing(p); formDialog.openDialog(); };

  const table = useLiftgoTable<PartInventory>({
    ...viewState,
    data: items,
    pageCount,
    manualSorting: true,
    columns: inventoryColumns,
    getRowId: (p) => p.id,
  });


  return (
    <>
      <ListPageLayout<PartInventory>
        title="Control de Refacciones"
        subtitle="Gestiona existencias y costos locales sobre el catálogo LiftGo"
        totalCount={totalCount}
        rowCount={totalCount}
        onRefresh={refetch}
        actions={canWrite ? <Button onClick={openCreate}><AddIcon className="h-4 w-4 mr-1" />Habilitar refacción</Button> : undefined}
        search={<SearchBar value={values.q} onChange={(value) => set("q", value)} placeholder="Buscar por nombre o SKU…" className="sm:max-w-xs" />}
        notice={lowStockCount > 0 && (
              <KpiTile
                label="Refacciones con stock bajo"
                value={lowStockCount}
                icon={InventoryIcon}
                iconColor="text-destructive"
                iconBg="bg-destructive/10"
                valueSize="lg"
                hint="Ver refacciones con stock bajo"
                onClick={() => set("stock", "low")}
              />
            )}
        filters={
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={values.category} onValueChange={(value) => set("category", value)}>
                <SelectTrigger aria-label="Filtrar por categoría" className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {PART_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={values.stock} onValueChange={(value) => set("stock", value)}>
                <SelectTrigger aria-label="Filtrar por existencias" className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las existencias</SelectItem>
                  <SelectItem value="low">Stock bajo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        table={table}
        rowAction={{ columnId: "name", label: (p) => `Ver refacción ${p.name}` }}
        onRowClick={(p) => detail.open(p.id)}
        emptyMessage="Sin refacciones registradas"
        emptyIcon={InventoryIcon}
        emptyActionLabel={canWrite ? "Habilitar refacción" : undefined}
        onEmptyAction={canWrite ? openCreate : undefined}
        skeletonColumns={5}
        mobileCardRender={(part) => <InventoryMobileCard part={part} onOpen={detail.open} />}
      />

      {detail.isOpen && selected.isError && <QueryErrorState entity="refacción" onRetry={() => { void selected.refetch(); }} />}
      {selectedPart && <PartDetailSheet
        key={selectedPart.id}
        part={selectedPart}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
        onEdit={(p) => openEdit(p)}
      />}

      {canWrite && <PartFormDialog open={formDialog.open} onOpenChange={formDialog.setOpen} part={editing} />}
      {canWrite && <ActivatePartDialog open={activateDialog.open} onOpenChange={activateDialog.setOpen} />}
    </>
  );
}
