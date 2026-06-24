import { useState, useCallback } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const formFields = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-5">
          <IdentitySection />
          <FiscalSection />
          <ContactSection />
          <AddressNotesSection />
        </div>
        <DialogFooter className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t">
          <FormActions
            submitLabel={isEdit ? "Guardar cambios" : "Agregar cliente"}
            isPending={isPending ?? false}
            onCancel={() => onOpenChange(false)}
          />
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="customer-form-dialog">
        <DialogHeader className="sticky top-0 bg-background z-10 -mx-6 px-6 pb-3 border-b">
          <DialogTitle>{isEdit ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="pt-2">
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

          <TabsContent value="manual" className="mt-4">
            {formFields}
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
            {formFields}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
