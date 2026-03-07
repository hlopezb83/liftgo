import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  useOperatingExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense,
  EXPENSE_CATEGORY_LABELS, type ExpenseCategory,
} from "@/hooks/useOperatingExpenses";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/TableSkeleton";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

interface FormData {
  category: ExpenseCategory;
  description: string;
  amount: string;
  expense_date: string;
}

const emptyForm: FormData = { category: "renta", description: "", amount: "", expense_date: new Date().toISOString().slice(0, 10) };

export default function OperatingExpensesPage() {
  const { data: expenses, isLoading } = useOperatingExpenses();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({ category: e.category, description: e.description || "", amount: String(e.amount), expense_date: e.expense_date });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = { category: form.category, description: form.description || undefined, amount: parseFloat(form.amount), expense_date: form.expense_date };
    if (!payload.amount || isNaN(payload.amount)) return;
    if (editingId) {
      updateExpense.mutate({ id: editingId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createExpense.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const filtered = (expenses || []).filter((e) => filterCategory === "all" || e.category === filterCategory);

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Gastos Operativos" subtitle="Registra gastos fijos y variables del negocio">
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nuevo Gasto</Button>
        </PageHeader>

        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4 items-end mb-4">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? <TableSkeleton columns={5} rows={5} /> : filtered.length === 0 ? (
              <EmptyState title="Sin gastos" description="Agrega tu primer gasto operativo" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{format(parseISO(e.expense_date), "dd MMM yyyy", { locale: es })}</TableCell>
                      <TableCell>{EXPENSE_CATEGORY_LABELS[e.category]}</TableCell>
                      <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteExpense.mutate(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar Gasto" : "Nuevo Gasto"}</DialogTitle></DialogHeader>
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
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción (opcional)</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!form.amount || createExpense.isPending || updateExpense.isPending}>
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
