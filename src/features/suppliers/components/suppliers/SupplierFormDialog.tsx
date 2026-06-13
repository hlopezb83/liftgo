import { useState, useEffect, useCallback } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCreateSupplier, useUpdateSupplier } from "../../hooks/useSuppliers";
import type { Supplier } from "../../hooks/useSuppliers";
import { useUploadDocument } from "@/hooks/useDocuments";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormActions } from "@/components/forms/FormActions";

import { SupplierFormFields } from "./SupplierFormFields";
import { SupplierCsfDropzone } from "./SupplierCsfDropzone";
import { emptySupplierForm, type SupplierForm } from "./supplierFormTypes";


interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

function supplierToForm(supplier: Supplier): SupplierForm {
  return {
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
    default_payment_terms_days: supplier.default_payment_terms_days != null
      ? String(supplier.default_payment_terms_days) : "",
  };
}

function parseTermsDays(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 365) return "invalid";
  return n;
}

function nullable(v: string): string | null { return v || null; }

function buildSupplierPayload(form: SupplierForm, termsNum: number | null) {
  return {
    name: form.name.trim(),
    contact_person: nullable(form.contact_person),
    email: nullable(form.email),
    phone: nullable(form.phone),
    website: nullable(form.website),
    address: nullable(form.address),
    rfc: form.rfc.trim() ? form.rfc.trim().toUpperCase() : null,
    regimen_fiscal: nullable(form.regimen_fiscal),
    category: nullable(form.category),
    notes: nullable(form.notes),
    default_payment_terms_days: termsNum,
  };
}

function validateSupplierForm(form: SupplierForm) {
  if (!form.name.trim()) { notifyError({ message: "El nombre es requerido" }); return null; }
  const terms = parseTermsDays(form.default_payment_terms_days);
  if (terms === "invalid") {
    notifyError({ message: "Días de crédito debe estar entre 0 y 365" });
    return null;
  }
  return buildSupplierPayload(form, terms);
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
    setForm(supplier ? supplierToForm(supplier) : emptySupplierForm);
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
    } catch (e: unknown) {
      notifyError({ error: e, message: "Proveedor guardado, pero falló la subida de la CSF" });
    }
  };

  const handleSave = () => {
    const validated = validateSupplierForm(form);
    if (!validated) return;
    if (supplier) {
      updateSupplier.mutate({ id: supplier.id, ...validated }, {
        onSuccess: async () => { await uploadCsfIfAny(supplier.id); onOpenChange(false); },
      });
    } else {
      createSupplier.mutate(validated, {
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
