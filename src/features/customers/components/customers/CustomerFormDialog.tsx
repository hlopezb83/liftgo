import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { customerFormSchema, type CustomerFormData } from "@/lib/formSchemas";
import { toast } from "sonner";
import {
  IdentitySection,
  FiscalSection,
  ContactSection,
  AddressNotesSection,
} from "./CustomerFormSections";
import { CsfDropzone } from "./CsfDropzone";

const emptyCustomer: CustomerFormData = {
  name: "", email: "", phone: "", address: "", notes: "",
  website: "", contact_person: "",
  rfc: "", razon_social: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "",
  representante_legal: "",
};

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<CustomerFormData>;
  isEdit?: boolean;
  isPending?: boolean;
  onSubmit: (data: CustomerFormData) => void;
}

export function CustomerFormDialog({ open, onOpenChange, initialData, isEdit, isPending, onSubmit }: CustomerFormDialogProps) {
  const { form, set, setForm, reset } = useFormState(emptyCustomer);
  const [tab, setTab] = useState("manual");

  useEffect(() => {
    if (open && initialData) {
      setForm({ ...emptyCustomer, ...initialData });
    } else if (open && !initialData) {
      reset();
      setTab("manual");
    }
    // Solo reaccionar a la apertura del diálogo; ignorar cambios en initialData/reset/setForm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCsfParsed = useCallback((patch: Partial<CustomerFormData>) => {
    setForm((prev) => {
      const next: CustomerFormData = { ...prev };
      (Object.keys(patch) as (keyof CustomerFormData)[]).forEach((k) => {
        const v = patch[k];
        if (v !== undefined && v !== "") (next as Record<string, unknown>)[k] = v;
      });
      return next;
    });
  }, [setForm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedResult = customerFormSchema.safeParse(form);
    if (!parsedResult.success) { toast.error(parsedResult.error.issues[0].message); return; }
    onSubmit(form);
  };

  const formFields = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <IdentitySection form={form} set={set} />
      <FiscalSection form={form} set={set} />
      <ContactSection form={form} set={set} />
      <AddressNotesSection form={form} set={set} />
      <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Agregar Cliente"} isPending={isPending} onCancel={() => onOpenChange(false)} />
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Cliente" : "Agregar Cliente"}</DialogTitle></DialogHeader>

        {isEdit ? (
          formFields
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex-1">Llenar manualmente</TabsTrigger>
              <TabsTrigger value="csf" className="flex-1">Importar desde CSF</TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              {formFields}
            </TabsContent>

            <TabsContent value="csf" className="space-y-4">
              <CsfDropzone onParsed={handleCsfParsed} />
              {formFields}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
