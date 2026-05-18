import { useState, useEffect } from "react";
import { useCreateSupplier, useUpdateSupplier } from "@/features/suppliers/hooks/useSuppliers";
import type { Supplier } from "@/features/suppliers/hooks/useSuppliers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormActions } from "@/components/FormActions";
import { toast } from "sonner";
import { SupplierFormFields, emptySupplierForm, type SupplierForm } from "./SupplierFormFields";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);

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
      setForm(emptySupplierForm);
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
          <SupplierFormFields form={form} setField={setField} />
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
