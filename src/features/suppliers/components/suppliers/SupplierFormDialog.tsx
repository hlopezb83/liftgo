import { useState, useEffect } from "react";
import { useCreateSupplier, useUpdateSupplier, SUPPLIER_CATEGORIES } from "@/features/suppliers/hooks/useSuppliers";
import type { Supplier } from "@/features/suppliers/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormActions } from "@/components/FormActions";
import { toast } from "sonner";
import { REGIMEN_FISCAL } from "@/lib/satCatalogs";

interface SupplierForm {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  rfc: string;
  regimen_fiscal: string;
  category: string;
  notes: string;
}

const emptyForm: SupplierForm = {
  name: "", contact_person: "", email: "", phone: "", website: "",
  address: "", rfc: "", regimen_fiscal: "", category: "", notes: "",
};

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (supplier) {
      setForm({
        name: supplier.name,
        contact_person: supplier.contact_person || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        website: supplier.website || "",
        address: supplier.address || "",
        rfc: supplier.rfc || "",
        regimen_fiscal: supplier.regimen_fiscal || "",
        category: supplier.category || "",
        notes: supplier.notes || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, supplier]);

  const setField = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      address: form.address || null,
      rfc: form.rfc || null,
      regimen_fiscal: form.regimen_fiscal || null,
      category: form.category || null,
      notes: form.notes || null,
    };
    if (supplier) {
      updateSupplier.mutate({ id: supplier.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createSupplier.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="space-y-1.5">
              <Label>Persona de Contacto</Label>
              <Input value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium text-muted-foreground">Datos Fiscales</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>RFC</Label>
                <Input value={form.rfc} onChange={(e) => setField("rfc", e.target.value)} placeholder="XAXX010101000" />
              </div>
              <div className="space-y-1.5">
                <Label>Régimen Fiscal</Label>
                <Select value={form.regimen_fiscal} onValueChange={(v) => setField("regimen_fiscal", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {REGIMEN_FISCAL.map((r) => <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium text-muted-foreground">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sitio Web</Label>
              <Input value={form.website} onChange={(e) => setField("website", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <FormActions
              submitLabel={supplier ? "Guardar" : "Crear"}
              isPending={createSupplier.isPending || updateSupplier.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
