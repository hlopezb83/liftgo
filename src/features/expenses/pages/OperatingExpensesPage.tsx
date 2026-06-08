import { useDialogState, useToggleDialog } from "@/hooks/useDialogState";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { capitalize, parseDateLocal } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useOperatingExpenses,
  EXPENSE_CATEGORY_LABELS, type OperatingExpense,
} from "@/features/expenses/hooks/useOperatingExpenses";
import { SearchBar } from "@/components/SearchBar";
import { ExpenseFormDialog } from "@/features/expenses/components/expenses/ExpenseFormDialog";
import { ExpenseDetailSheet } from "@/features/expenses/components/expenses/ExpenseDetailSheet";
import { ExpenseEditDialog } from "@/features/expenses/components/expenses/ExpenseEditDialog";
import { ListPageLayout } from "@/components/ListPageLayout";
import { useExpenseFilters } from "@/features/expenses/hooks/expenses/useExpenseFilters";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

export default function OperatingExpensesPage() {
  const { data: expenses, isLoading } = useOperatingExpenses();

  const createDialog = useToggleDialog();
  const editDialog = useDialogState<OperatingExpense>();
  const detail = useDialogState<OperatingExpense>();

  const f = useExpenseFilters(expenses);


  const columns = useMemo<ColumnDef<OperatingExpense>[]>(
    () => [
      {
        id: "expense_date",
        header: "Fecha",
        accessorKey: "expense_date",
        cell: ({ row }) => format(parseDateLocal(row.original.expense_date), "dd MMM yyyy", { locale: es }),
      },
      {
        id: "category",
        header: "Categoría",
        accessorKey: "category",
        cell: ({ row }) => (
          <Badge variant={row.original.category === "costo_venta" ? "secondary" : "outline"}>
            {EXPENSE_CATEGORY_LABELS[row.original.category]}
          </Badge>
        ),
      },
      {
        id: "description",
        header: "Descripción",
        accessorFn: (e) => e.description || "",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || "—"}</span>,
      },
      {
        id: "amount",
        header: "Monto",
        accessorKey: "amount",
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.amount)}</span>,
      },
      {
        id: "supplier",
        header: "Proveedor",
        accessorFn: (e) => e.suppliers?.name || "",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.suppliers?.name || "—"}</span>,
      },
    ],
    [],
  );

  const table = useLiftgoTable<OperatingExpense>({
    data: f.filtered,
    columns,
    getRowId: (e) => e.id,
  });

  const mobileCard = (e: OperatingExpense) => (
    <Card onClick={() => detail.open(e)} className="cursor-pointer">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant={e.category === "costo_venta" ? "secondary" : "outline"}>
            {EXPENSE_CATEGORY_LABELS[e.category]}
          </Badge>
          <span className="font-mono text-sm">{formatCurrency(e.amount)}</span>
        </div>
        <p className="text-sm">{e.description || "—"}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{format(parseDateLocal(e.expense_date), "dd MMM yyyy", { locale: es })}</span>
          <span>{e.suppliers?.name || "—"}</span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <ListPageLayout<OperatingExpense>
        title="Gastos Operativos"
        subtitle="Registra gastos fijos y variables del negocio"
        totalCount={f.filtered.length}
        actions={
          <div className="flex gap-2">
            <Button onClick={createDialog.openDialog}>
              <Plus className="h-4 w-4 mr-1" />Registrar Gasto
            </Button>
          </div>
        }
        filters={
          <div className="space-y-3">
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <div className="rounded-full bg-primary/10 p-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Gastos</p>
                  <p className="text-2xl font-bold font-mono">{formatCurrency(f.total)}</p>
                </div>
              </CardContent>
            </Card>
            <div className="flex flex-col sm:flex-row gap-3">
              <SearchBar value={f.search} onChange={f.setSearch} placeholder="Buscar por descripción…" className="sm:max-w-xs" />
              <Select value={f.filterMonth} onValueChange={f.setFilterMonth}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {f.availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {capitalize(format(new Date(m + "-15"), "MMM yyyy", { locale: es }))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={f.filterCategory} onValueChange={f.setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {f.availableCategories.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(e) => detail.open(e)}
        emptyMessage="Sin gastos registrados"
        emptyIcon={DollarSign}
        emptyActionLabel="Registrar Gasto"
        onEmptyAction={createDialog.openDialog}
        skeletonColumns={5}
        mobileCardRender={mobileCard}
      />

      <ExpenseFormDialog
        open={createDialog.open}
        onOpenChange={createDialog.setOpen}
        onCreated={handleCreated}
      />


      <ExpenseDetailSheet
        expense={detail.selected}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
        onEdit={(e) => editDialog.open(e)}
      />

      <ExpenseEditDialog
        expense={editDialog.selected}
        open={editDialog.isOpen}
        onOpenChange={editDialog.onOpenChange}
      />
    </>
  );
}
