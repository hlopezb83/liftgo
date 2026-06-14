import { useState, useCallback } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormActions } from "@/components/forms/FormActions";
import { customerFormSchema, type CustomerFormData } from "../../lib/customerFormSchema";
import {
  Form,
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
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: emptyCustomer,
  });
  const [tab, setTab] = useState("manual");

  usePrefillEffect(() => {
    if (!open) return;
    if (initialData) {
      form.reset({ ...emptyCustomer, ...initialData });
    } else {
      form.reset(emptyCustomer);
      setTab("manual");
    }
  }, [open]);

  const handleCsfParsed = useCallback((patch: Partial<CustomerFormData>) => {
    const current = form.getValues();
    const next: CustomerFormData = { ...current };
    (Object.keys(patch) as (keyof CustomerFormData)[]).forEach((k) => {
      const v = patch[k];
      if (v !== undefined && v !== "") (next as Record<string, unknown>)[k] = v;
    });
    form.reset(next, { keepDirty: true });
  }, [form]);

  const formFields = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <IdentitySection />
        <FiscalSection />
        <ContactSection />
        <AddressNotesSection />
        <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Agregar Cliente"} isPending={isPending ?? false} onCancel={() => onOpenChange(false)} />
      </form>
    </Form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="customer-form-dialog">
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
