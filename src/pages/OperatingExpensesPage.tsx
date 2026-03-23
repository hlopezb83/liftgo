import { useState, useMemo } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { capitalize, parseDateLocal } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useOperatingExpenses, useUpdateExpense, useDeleteExpense, useGenerateRecurring,
  EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type OperatingExpense,
} from "@/hooks/useOperatingExpenses";
import { SearchBar } from "@/components/SearchBar";
import { EmptyRow } from "@/components/EmptyRow";
import { TableSkeleton } from "@/components/TableSkeleton";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { ExpenseDetailSheet } from "@/components/expenses/ExpenseDetailSheet";
import { SupplierSelector } from "@/components/suppliers/SupplierSelector";
import type { OperatingExpense } from "@/hooks/useOperatingExpenses";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

interface FormData {
  category: ExpenseCategory;
  description: string;
  amount: string;
  expense_date: string;
  is_recurring: boolean;
  supplier_id: string;
}

const emptyForm: FormData = { category: "renta", description: "", amount: "", expense_date: new Date().toISOString().slice(0, 10), is_recurring: false, supplier_id: "" };

export default function OperatingExpensesPage() {
  const { data: expenses, isLoading } = useOperatingExpenses();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const generateRecurring = useGenerateRecurring();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [search, setSearch] = useState("");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (expenses || []).forEach((e) => set.add(e.expense_date.slice(0, 7)));
    // always include current month
    set.add(format(new Date(), "yyyy-MM"));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const openEdit = (e: OperatingExpense) => {
    setEditingId(e.id);
    setForm({ category: e.category, description: e.description || "", amount: String(e.amount), expense_date: e.expense_date, is_recurring: e.is_recurring ?? false, supplier_id: e.supplier_id || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = { category: form.category as import("@/hooks/useOperatingExpenses").ExpenseCategory, description: form.description || undefined, amount: parseFloat(form.amount), expense_date: form.expense_date, is_recurring: form.is_recurring, supplier_id: form.supplier_id || null };
    if (!payload.amount || isNaN(payload.amount)) return;
    if (editingId) {
      updateExpense.mutate({ id: editingId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const availableCategories = useMemo(() => {
    const set = new Set<ExpenseCategory>();
    (expenses || []).forEach((e) => set.add(e.category));
    return CATEGORIES.filter(([v]) => set.has(v));
  }, [expenses]);

  const filtered = useMemo(() => {
    return (expenses || []).filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterMonth !== "all" && !e.expense_date.startsWith(filterMonth)) return false;
      if (search && !(e.description || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [expenses, filterCategory, filterMonth, search]);

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Gastos Operativos" subtitle="Registra gastos fijos y variables del negocio" action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generateRecurring.mutate()} disabled={generateRecurring.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${generateRecurring.isPending ? "animate-spin" : ""}`} />Generar Recurrentes
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Registrar Gasto</Button>
          </div>
        } />

        {/* Summary card */}
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-full bg-primary/10 p-3">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Gastos</p>
              <p className="text-2xl font-bold font-mono">{formatCurrency(total)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar por descripción…" className="sm:max-w-xs" />
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {capitalize(format(new Date(m + "-15"), "MMM yyyy", { locale: es }))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {availableCategories.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? <TableSkeleton columnCount={6} rows={5} /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <EmptyRow colSpan={6} message="Sin gastos registrados" />
                  ) : (
                    filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{format(parseDateLocal(e.expense_date), "dd MMM yyyy", { locale: es })}</TableCell>
                        <TableCell>
                          <Badge variant={e.category === "costo_venta" ? "secondary" : "outline"}>
                            {EXPENSE_CATEGORY_LABELS[e.category]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">{e.suppliers?.name || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteExpense.mutate(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ExpenseFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Gasto</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input type="number" min="0" step="0.01" className="pl-7" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción (opcional)</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <SupplierSelector value={form.supplier_id} onChange={(v) => setForm({ ...form, supplier_id: v })} />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Gasto recurrente mensual</Label>
                  <p className="text-xs text-muted-foreground">Se podrá generar automáticamente cada mes</p>
                </div>
                <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!form.amount || updateExpense.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
