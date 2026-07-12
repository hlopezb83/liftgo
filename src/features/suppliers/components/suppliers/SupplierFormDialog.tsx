import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { CsfDropzone } from "@/components/forms/CsfDropzone";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { EditIcon, DocumentIcon } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUploadDocument } from "@/hooks/useDocuments";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError } from "@/lib/ui/appFeedback";
import { useCreateSupplier, useUpdateSupplier } from "../../hooks/useSuppliers";
import {
  supplierFormSchema,
  emptySupplierFormData,
  type SupplierFormData,
} from "../../lib/supplierFormSchema";
import { SupplierFormFields } from "./SupplierFormFields";
import type { Supplier } from "../../hooks/useSuppliers";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

function supplierToFormData(supplier: Supplier): SupplierFormData {
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
      ? String(supplier.default_payment_terms_days)
      : "",
  };
}

function nullable(v: string): string | null { return v.trim() ? v.trim() : null; }

function buildPayload(data: SupplierFormData) {
  const termsRaw = data.default_payment_terms_days.trim();
  const terms = termsRaw === "" ? null : Number(termsRaw);
  return {
    name: data.name.trim(),
    contact_person: nullable(data.contact_person),
    email: nullable(data.email),
    phone: nullable(data.phone),
    website: nullable(data.website),
    address: nullable(data.address),
    rfc: data.rfc.trim() ? data.rfc.trim().toUpperCase() : null,
    regimen_fiscal: nullable(data.regimen_fiscal),
    category: nullable(data.category),
    notes: nullable(data.notes),
    default_payment_terms_days: terms,
  };
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const uploadDoc = useUploadDocument();

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: emptySupplierFormData,
  });
  const [tab, setTab] = useState("manual");
  const [csfFile, setCsfFile] = useState<File | null>(null);

  usePrefillEffect(() => {
    if (!open) return;
    setTab("manual");
    setCsfFile(null);
    form.reset(supplier ? supplierToFormData(supplier) : emptySupplierFormData);
  }, [open, supplier]);

  const handleCsfParsed = (patch: Partial<SupplierFormData>, file: File) => {
    setCsfFile(file);
    const current = form.getValues();
    const next: SupplierFormData = { ...current };
    (Object.keys(patch) as (keyof SupplierFormData)[]).forEach((k) => {
      const v = patch[k];
      if (v !== undefined && v !== "") (next as Record<string, unknown>)[k] = v;
    });
    form.reset(next, { keepDirty: true });
  };

  const uploadCsfIfAny = async (supplierId: string) => {
    if (!csfFile) return;
    try {
      await uploadDoc.mutateAsync({ file: csfFile, entityType: "supplier", entityId: supplierId });
    } catch (e: unknown) {
      notifyError({ error: e, message: "Proveedor guardado, pero falló la subida de la CSF" });
    }
  };

  const onSubmit = (data: SupplierFormData) => {
    const payload = buildPayload(data);
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

  const isPending = createSupplier.isPending || updateSupplier.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? "Editar Proveedor" : "Nuevo Proveedor"}
      width="lg"
      testId="supplier-form-dialog"
    >
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex-1">
                <EditIcon className="h-3.5 w-3.5 mr-1.5" />
                Llenar manualmente
              </TabsTrigger>
              <TabsTrigger value="csf" className="flex-1">
                <DocumentIcon className="h-3.5 w-3.5 mr-1.5" />
                Importar desde CSF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <SupplierFormFields />
            </TabsContent>

            <TabsContent value="csf" className="mt-4 space-y-4">
              <CsfDropzone<SupplierFormData>
                onParsed={handleCsfParsed}
                mapData={(data) => {
                  const patch: Partial<SupplierFormData> = {};
                  const name = data.name || data.razon_social;
                  if (name) patch.name = name;
                  if (data.rfc) patch.rfc = data.rfc;
                  if (data.regimen_fiscal) patch.regimen_fiscal = data.regimen_fiscal;
                  if (data.address) patch.address = data.address;
                  if (data.representante_legal) patch.contact_person = data.representante_legal;
                  return patch;
                }}
              />
              <SupplierFormFields />
            </TabsContent>
          </Tabs>

          <FormDialogFooter>
            <FormActions
              submitLabel={supplier ? "Guardar cambios" : "Agregar proveedor"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </FormProvider>
    </FormDialog>
  );
}
