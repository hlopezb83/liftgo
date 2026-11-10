import type { ColumnDef } from "@/components/dataTable/v2";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { partCategoryLabel } from "../../lib/partCategories";
import type { PartInventory } from "../../hooks/usePartsInventory";

export const inventoryColumns: ColumnDef<PartInventory>[] = [
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
      cell: ({ row }) => <Badge variant="outline">{partCategoryLabel(row.original.category)}</Badge>,
    },
    {
      id: "unit_cost",
      header: "Costo Unitario",
      accessorKey: "unit_cost",
      meta: { kind: "money" },
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
 ];
