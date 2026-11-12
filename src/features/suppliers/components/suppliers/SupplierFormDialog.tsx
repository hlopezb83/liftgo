import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { CsfDropzone } from "@/components/forms/CsfDropzone";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { EditIcon, DocumentIcon } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUploadDocument } from "@/hooks/useDocuments";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useCreateSupplier, useUpdateSupplier } from "../../hooks/useSuppliers";
import { applySupplierCsfPatch } from "../../lib/applySupplierCsfPatch";
import {
  buildSupplierPayload,
  supplierToFormData,
} from "../../lib/supplierFormPayload";
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

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  return open ? <SupplierFormSession key={supplier?.id ?? "new"} onOpenChange={onOpenChange} supplier={supplier} /> : null;
}

type PendingCsf = { supplierId: string; file: File };

function SupplierFormSession({ onOpenChange, supplier }: Omit<SupplierFormDialogProps, "open">) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const uploadDoc = useUploadDocument();

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: supplier ? supplierToFormData(supplier) : emptySupplierFormData,
  });
  const [tab, setTab] = useState("manual");
  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [pendingCsf, setPendingCsf] = useState<PendingCsf | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleCsfParsed = (patch: Partial<SupplierFormData>, file: File) => {
    if (inFlight.current) return;
    setCsfFile(file);
    applySupplierCsfPatch(form, patch);
  };

  const onSubmit = async (data: SupplierFormData) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSaving(true);
    setUploadFailed(false);
    let attachment = pendingCsf;
    try {
      if (!attachment) {
        const payload = buildSupplierPayload(data);
        const saved = supplier
          ? await updateSupplier.mutateAsync({ id: supplier.id, ...payload })
          : await createSupplier.mutateAsync(payload);
        if (!mounted.current) return;
        form.reset(data);
        if (csfFile) {
          attachment = { supplierId: supplier?.id ?? saved.id, file: csfFile };
          setPendingCsf(attachment);
        }
      }
      if (attachment) {
        await uploadDoc.mutateAsync({ file: attachment.file, entityType: "supplier", entityId: attachment.supplierId });
      }
      if (mounted.current) onOpenChange(false);
    } catch {
      // Mutation hooks report the error; keep the confirmed supplier and file
      // so the next submit retries only the attachment.
      if (mounted.current && attachment) setUploadFailed(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const isPending = isSaving || createSupplier.isPending || updateSupplier.isPending || uploadDoc.isPending;
  const hasUnsavedChanges = form.formState.isDirty || csfFile !== null;
  useUnsavedChangesGuard(hasUnsavedChanges && !isPending);

  return (
    <FormDialog
      isPending={isPending}
      isDirty={hasUnsavedChanges}
      open
      onOpenChange={onOpenChange}
      title={supplier ? "Editar proveedor" : "Nuevo proveedor"}
      width="lg"
      testId="supplier-form-dialog"
    >
      <FormProvider {...form}>
        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} className="space-y-4">
          {pendingCsf ? (
            <div role={uploadFailed ? "alert" : "status"} className="space-y-2 rounded-lg border p-4">
              <p className="font-medium">El proveedor ya está guardado.</p>
              <p className="text-sm text-muted-foreground">
                {uploadFailed ? "No se pudo adjuntar la CSF. Reintenta la subida sin volver a guardar el proveedor." : "Subiendo la CSF…"}
              </p>
              <p className="break-words text-sm">{pendingCsf.file.name}</p>
              {uploadFailed && <p className="text-sm text-muted-foreground">Si cierras este diálogo, podrás adjuntar el archivo después desde la ficha del proveedor.</p>}
            </div>
          ) : <fieldset disabled={isPending} className="min-w-0">
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
          </fieldset>}

          <FormDialogFooter>
            <FormActions
              submitLabel={pendingCsf ? "Reintentar subida de CSF" : supplier ? "Guardar cambios" : "Agregar proveedor"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </FormProvider>
    </FormDialog>
  );
}
