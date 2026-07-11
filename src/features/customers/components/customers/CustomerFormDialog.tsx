import { useState, useCallback } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { Pencil, FileText } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormActions } from "@/components/forms/FormActions";
import { CsfDropzone } from "@/components/forms/CsfDropzone";
import { sanitizeCsfName } from "../../lib/csfSanitize";
import { customerFormSchema, type CustomerFormData } from "../../lib/customerFormSchema";
import {
  Form,
  IdentitySection,
  FiscalSection,
  ContactSection,
  AddressNotesSection,
} from "./CustomerFormSections";

const emptyCustomer: CustomerFormData = {
  name: "", email: "", phone: "", address: "", notes: "",
  website: "", contact_person: "",
  rfc: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "",
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar Cliente" : "Nuevo Cliente"}
      width="lg"
      testId="customer-form-dialog"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex-1">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Llenar manualmente
              </TabsTrigger>
              <TabsTrigger value="csf" className="flex-1">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Importar desde CSF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-4 space-y-5">
              <IdentitySection />
              <FiscalSection />
              <ContactSection />
              <AddressNotesSection />
            </TabsContent>

            <TabsContent value="csf" className="mt-4 space-y-4">
              <CsfDropzone<CustomerFormData>
                onParsed={(patch) => handleCsfParsed(patch)}
                mapData={(data) => {
                  const cleanName = sanitizeCsfName(data.name || data.razon_social || "");
                  return {
                    name: cleanName || undefined,
                    rfc: data.rfc || undefined,
                    domicilio_fiscal_cp: data.domicilio_fiscal_cp || undefined,
                    address: data.address || undefined,
                    regimen_fiscal: data.regimen_fiscal || undefined,
                    representante_legal: data.representante_legal || undefined,
                  };
                }}
              />
              <div className="space-y-5">
                <IdentitySection />
                <FiscalSection />
                <ContactSection />
                <AddressNotesSection />
              </div>
            </TabsContent>
          </Tabs>

          <FormDialogFooter>
            <FormActions
              submitLabel={isEdit ? "Guardar cambios" : "Agregar cliente"}
              isPending={isPending ?? false}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
