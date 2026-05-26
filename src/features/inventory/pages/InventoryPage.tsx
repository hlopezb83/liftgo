import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { usePartsInventory, type PartInventory } from "@/features/inventory/hooks/usePartsInventory";
import { PartDetailSheet } from "@/features/inventory/components/inventory/PartDetailSheet";
import { PartFormDialog, PART_CATEGORIES } from "@/features/inventory/components/inventory/PartFormDialog";
import { SearchBar } from "@/components/SearchBar";
import { ListPageLayout } from "@/components/ListPageLayout";
import { useDialogState, useToggleDialog } from "@/hooks/useDialogState";
import { useInventoryFilters } from "@/features/inventory/hooks/inventory/useInventoryFilters";
import { useState, useCallback, useMemo } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

export default function InventoryPage() {
  const { data: parts, isLoading } = usePartsInventory();

  const formDialog = useToggleDialog();
  const [editing, setEditing] = useState<PartInventory | null>(null);
  const detail = useDialogState<PartInventory>();

  const { search, setSearch, filterCategory, setFilterCategory, filtered, lowStockCount } =
    useInventoryFilters(parts);

  const openCreate = useCallback(() => { setEditing(null); formDialog.openDialog(); }, [formDialog]);
  const openEdit = useCallback((p: PartInventory) => { setEditing(p); formDialog.openDialog(); }, [formDialog]);

  const columns = useMemo<ColumnDef<PartInventory>[]>(
    () => [
      {
        id: "sku",
        header: "SKU",
        accessorFn: (p) => p.sku || "",
        cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.sku || "—"}</span>,
      },
      {
        id: "name",
        header: "Nombre",
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "category",
        header: "Categoría",
        accessorKey: "category",
        cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge>,
      },
      {
        id: "unit_cost",
        header: "Costo Unitario",
        accessorKey: "unit_cost",
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.unit_cost)}</span>,
      },
      {
        id: "stock_quantity",
        header: "Stock",
        accessorKey: "stock_quantity",
        meta: { align: "center" },
        cell: ({ row }) => {
          const p = row.original;
          const isLow = p.stock_quantity <= p.min_stock_level;
          return (
            <Badge variant={isLow ? "destructive" : "secondary"}>
              {isLow ? `${p.stock_quantity} - Reabastecer` : p.stock_quantity}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const table = useLiftgoTable<PartInventory>({
    data: filtered,
    columns,
    getRowId: (p) => p.id,
  });

  const mobileCard = (p: PartInventory) => {
    const isLow = p.stock_quantity <= p.min_stock_level;
    return (
      <Card onClick={() => detail.open(p)} className="cursor-pointer">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{p.sku || "Sin SKU"}</p>
            </div>
            <Badge variant={isLow ? "destructive" : "secondary"}>{p.stock_quantity}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <Badge variant="outline">{p.category}</Badge>
            <span className="font-mono">{formatCurrency(p.unit_cost)}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <ListPageLayout<PartInventory>
        title="Control de Refacciones"
        subtitle="Gestiona el inventario de partes y refacciones"
        totalCount={filtered.length}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nueva Refacción</Button>}
        filters={
          <div className="space-y-3">
            {lowStockCount > 0 && (
              <Card>
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="rounded-full bg-destructive/10 p-3">
                    <Package className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Refacciones con stock bajo</p>
                    <p className="text-2xl font-bold font-mono text-destructive">{lowStockCount}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o SKU…" className="sm:max-w-xs" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {PART_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(p) => detail.open(p)}
        emptyMessage="Sin refacciones registradas"
        emptyIcon={Package}
        emptyActionLabel="Nueva Refacción"
        onEmptyAction={openCreate}
        skeletonColumns={5}
        mobileCardRender={mobileCard}
      />

      <PartDetailSheet
        part={detail.selected}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
        onEdit={(p) => openEdit(p)}
      />

      <PartFormDialog open={formDialog.open} onOpenChange={formDialog.setOpen} part={editing} />
    </>
  );
}
