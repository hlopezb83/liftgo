import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Plus, Package } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { usePartsInventory, type PartInventory } from "@/hooks/usePartsInventory";
import { PartDetailSheet } from "@/components/inventory/PartDetailSheet";
import { PartFormDialog, PART_CATEGORIES } from "@/components/inventory/PartFormDialog";
import { SearchBar } from "@/components/SearchBar";
import { ListPageLayout } from "@/components/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

export default function InventoryPage() {
  const { data: parts, isLoading } = usePartsInventory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartInventory | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartInventory | null>(null);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: PartInventory) => { setEditing(p); setDialogOpen(true); };

  const filtered = useMemo(() => {
    return (parts || []).filter((p) => {
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [parts, filterCategory, search]);

  const lowStockCount = useMemo(() => (parts || []).filter((p) => p.stock_quantity <= p.min_stock_level).length, [parts]);

  const { page, setPage, totalPages, paginatedItems } = useListPage(filtered);

  const renderRow = (p: PartInventory) => {
    const isLow = p.stock_quantity <= p.min_stock_level;
    return (
      <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelectedPart(p)}>
        <TableCell className="font-mono text-muted-foreground">{p.sku || "—"}</TableCell>
        <TableCell className="font-medium">{p.name}</TableCell>
        <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(p.unit_cost)}</TableCell>
        <TableCell className="text-center">
          <Badge variant={isLow ? "destructive" : "secondary"}>
            {isLow ? `${p.stock_quantity} - Reabastecer` : p.stock_quantity}
          </Badge>
        </TableCell>
      </TableRow>
    );
  };

  const mobileCard = (p: PartInventory) => {
    const isLow = p.stock_quantity <= p.min_stock_level;
    return (
      <Card onClick={() => setSelectedPart(p)} className="cursor-pointer">
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
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="Sin refacciones registradas"
        emptyIcon={Package}
        emptyActionLabel="Nueva Refacción"
        onEmptyAction={openCreate}
        skeletonColumns={5}
        tableHeader={
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-right">Costo Unitario</TableHead>
            <TableHead className="text-center">Stock</TableHead>
          </TableRow>
        }
        renderRow={renderRow}
        mobileCardRender={mobileCard}
      />

      <PartDetailSheet
        part={selectedPart}
        open={!!selectedPart}
        onOpenChange={(open) => { if (!open) setSelectedPart(null); }}
        onEdit={(p) => openEdit(p)}
      />

      <PartFormDialog open={dialogOpen} onOpenChange={setDialogOpen} part={editing} />
    </>
  );
}
