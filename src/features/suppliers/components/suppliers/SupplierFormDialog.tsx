import { useState, useEffect, useCallback } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCreateSupplier, useUpdateSupplier } from "@/features/suppliers/hooks/useSuppliers";
import type { Supplier } from "@/features/suppliers/hooks/useSuppliers";
import { useUploadDocument } from "@/hooks/useDocuments";
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
  const uploadDoc = useUploadDocument();
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);
  const [tab, setTab] = useState("manual");
  const [csfFile, setCsfFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("manual");
    setCsfFile(null);
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
        default_payment_terms_days:
          supplier.default_payment_terms_days != null
            ? String(supplier.default_payment_terms_days)
            : "",
      });
    } else {
      setForm(emptySupplierForm);
    }
  }, [open, supplier]);


  const setField = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCsfParsed = useCallback((patch: Partial<SupplierForm>, file: File) => {
    setCsfFile(file);
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

  const uploadCsfIfAny = async (supplierId: string) => {
    if (!csfFile) return;
    try {
      await uploadDoc.mutateAsync({ file: csfFile, entityType: "supplier", entityId: supplierId });
    } catch (e) {
      notifyError({ error: e, message: "Proveedor guardado, pero falló la subida de la CSF" });
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) { notifyError({ message: "El nombre es requerido" }); return; }
    const termsRaw = form.default_payment_terms_days.trim();
    const termsNum = termsRaw === "" ? null : Number(termsRaw);
    if (termsNum !== null && (!Number.isFinite(termsNum) || termsNum < 0 || termsNum > 365)) {
      notifyError({ message: "Días de crédito debe estar entre 0 y 365" });
      return;
    }
    const normalizedRfc = form.rfc.trim() ? form.rfc.trim().toUpperCase() : null;
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      address: form.address || null,
      rfc: normalizedRfc,
      regimen_fiscal: form.regimen_fiscal || null,
      category: form.category || null,
      notes: form.notes || null,
      default_payment_terms_days: termsNum,
    };
    if (supplier) {
      updateSupplier.mutate({ id: supplier.id, ...payload }, {
        onSuccess: async () => { await uploadCsfIfAny(supplier.id); onOpenChange(false); },
      });
    } else {
      createSupplier.mutate(payload, {
        onSuccess: async (created) => { if (created?.id) await uploadCsfIfAny(created.id); onOpenChange(false); },
      });
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
