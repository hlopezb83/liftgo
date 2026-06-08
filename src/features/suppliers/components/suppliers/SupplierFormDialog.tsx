import { useState, useEffect, useCallback } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCreateSupplier, useUpdateSupplier } from "@/features/suppliers/hooks/useSuppliers";
import type { Supplier } from "@/features/suppliers/hooks/useSuppliers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormActions } from "@/components/FormActions";

import { SupplierFormFields } from "./SupplierFormFields";
import { SupplierCsfDropzone } from "./SupplierCsfDropzone";
import { emptySupplierForm, type SupplierForm } from "./supplierFormTypes";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);
  const [tab, setTab] = useState("manual");

  useEffect(() => {
    if (!open) return;
    setTab("manual");
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

  const handleCsfParsed = useCallback((patch: Partial<SupplierForm>) => {
    setForm((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof SupplierForm)[]).forEach((k) => {
        const v = patch[k];
        if (v !== undefined && v !== "") {
          (next[k] as SupplierForm[typeof k]) = v as SupplierForm[typeof k];
        }
      });
      return next;
    });
  }, []);

  const handleSave = () => {
    if (!form.name.trim()) { notifyError({ message: "El nombre es requerido" }); return; }
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

  const formContent = (
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">Llenar manualmente</TabsTrigger>
            <TabsTrigger value="csf" className="flex-1">Importar desde CSF</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            {formContent}
          </TabsContent>

          <TabsContent value="csf" className="space-y-4">
            <SupplierCsfDropzone onParsed={handleCsfParsed} />
            {formContent}
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
