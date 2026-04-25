import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Package } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { usePartsInventory, useCreatePart, useUpdatePart, useDeletePart, type PartInventory } from "@/hooks/usePartsInventory";
import { PartDetailSheet } from "@/components/inventory/PartDetailSheet";
import { partFormSchema, type PartFormData } from "@/lib/formSchemas";
import { SearchBar } from "@/components/SearchBar";
import { EmptyRow } from "@/components/EmptyRow";
import { TableSkeleton } from "@/components/TableSkeleton";

const PART_CATEGORIES = ["Filtros", "Llantas", "Aceites", "Baterías", "Otros"] as const;

export default function InventoryPage() {
  const { data: parts, isLoading } = usePartsInventory();
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const deletePart = useDeletePart();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartInventory | null>(null);

  const form = useForm<PartFormData>({
    resolver: zodResolver(partFormSchema),
    defaultValues: { name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0 },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0 });
    setDialogOpen(true);
  };

  const openEdit = (p: PartInventory) => {
    setEditingId(p.id);
    form.reset({
      name: p.name,
      sku: p.sku || "",
      category: p.category,
      stock_quantity: p.stock_quantity,
      min_stock_level: p.min_stock_level,
      unit_cost: p.unit_cost,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: PartFormData) => {
    const payload = {
      name: data.name,
      sku: data.sku || null,
      category: data.category,
      stock_quantity: data.stock_quantity,
      min_stock_level: data.min_stock_level,
      unit_cost: data.unit_cost,
    };
    if (editingId) {
      updatePart.mutate({ id: editingId, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createPart.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

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
  const isPending = createPart.isPending || updatePart.isPending;

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Control de Refacciones"
          subtitle="Gestiona el inventario de partes y refacciones"
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nueva Refacción</Button>}
        />

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

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o SKU…" className="sm:max-w-xs" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {PART_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? <TableSkeleton columnCount={6} rows={5} /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Costo Unitario</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <EmptyRow colSpan={6} message="Sin refacciones registradas" />
                  ) : (
                    filtered.map((p) => {
                      const isLow = p.stock_quantity <= p.min_stock_level;
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPart(p)}>
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
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <PartDetailSheet
          part={selectedPart}
          open={!!selectedPart}
          onOpenChange={(open) => { if (!open) setSelectedPart(null); }}
          onEdit={(p) => openEdit(p)}
        />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Refacción" : "Nueva Refacción"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl><Input {...field} placeholder="Ej. Filtro de aceite" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input {...field} placeholder="Ej. FLT-001" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PART_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="stock_quantity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Inicial</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="min_stock_level" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Mínimo</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="unit_cost" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo Unitario</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input type="number" min="0" step="0.01" className="pl-7" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Guardando…" : "Guardar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
