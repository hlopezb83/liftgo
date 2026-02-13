import { useState } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "@/hooks/useForkliftData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { FormActions } from "@/components/FormActions";
import { Search, PlusCircle, Edit } from "lucide-react";
import { toast } from "sonner";

const emptyCustomer = { name: "", email: "", phone: "", company: "", address: "", notes: "" };

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCustomer);

  const filtered = customers?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const openCreate = () => { setEditId(null); setForm(emptyCustomer); setDialogOpen(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, email: c.email || "", phone: c.phone || "", company: c.company || "", address: c.address || "", notes: c.notes || "" });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error("Name is required"); return; }
    const payload = { name: form.name, email: form.email || null, phone: form.phone || null, company: form.company || null, address: form.address || null, notes: form.notes || null };

    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Customer updated"); setDialogOpen(false); } });
    } else {
      createCustomer.mutate(payload, { onSuccess: () => { toast.success("Customer added"); setDialogOpen(false); setForm(emptyCustomer); } });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customers"
        subtitle={`${customers?.length || 0} customers`}
        action={<Button onClick={openCreate} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Add Customer</Button>}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.company || "—"}</TableCell>
                    <TableCell>{c.email || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered?.length === 0 && <EmptyRow colSpan={5} message="No customers found" />}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@example.com" /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 0123" /></div>
            </div>
            <div className="space-y-1.5"><Label>Company</Label><Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="ABC Construction" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" /></div>
            <FormActions submitLabel={editId ? "Save Changes" : "Add Customer"} isPending={createCustomer.isPending || updateCustomer.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
