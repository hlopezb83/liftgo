import { useState } from "react";
import { useForm } from "react-hook-form";
import { CsfDropzone } from "@/components/forms/CsfDropzone";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { EditIcon, DocumentIcon } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { zodResolver } from "@/lib/forms/zodResolver";
import { sanitizeCsfName } from "../../lib/csfSanitize";
import { customerFormSchema, type CustomerFormData } from "../../lib/customerFormSchema";
import { preserveUntouched } from "../../lib/preserveUntouched";
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
  representante_legal: "", tax_rate: "",
};

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<CustomerFormData>;
  isEdit?: boolean;
  isPending?: boolean;
  onSubmit: (data: CustomerFormData) => void;
}

export function CustomerFormDialog(props: CustomerFormDialogProps) {
  return props.open ? <CustomerFormSession {...props} /> : null;
}

function CustomerFormSession({ open, onOpenChange, initialData, isEdit, isPending, onSubmit }: CustomerFormDialogProps) {
  // El borrador y su base pertenecen a esta apertura. Un refetch no los reemplaza.
  const [initialValues] = useState(() => ({ ...emptyCustomer, ...initialData }));
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: initialValues,
  });
  const [tab, setTab] = useState("manual");
  const busy = (isPending ?? false) || form.formState.isSubmitting;
  useUnsavedChangesGuard(open && form.formState.isDirty && !busy);

  const handleCsfParsed = (patch: Partial<CustomerFormData>) => {
    (Object.keys(patch) as (keyof CustomerFormData)[]).forEach((k) => {
      const v = patch[k];
      if (v !== undefined && v !== "") form.setValue(k, v, { shouldDirty: true, shouldValidate: true });
    });
  };

  return (
    <FormDialog
      isPending={busy}
      isDirty={form.formState.isDirty}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar cliente" : "Nuevo cliente"}
      width="lg"
      testId="customer-form-dialog"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => {
          if (isPending) return;
          onSubmit(preserveUntouched(data, initialValues, isEdit, form.formState.dirtyFields));
        })} className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="min-w-0 px-2">
                <EditIcon className="h-3.5 w-3.5 mr-1.5" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="csf" className="min-w-0 px-2">
                <DocumentIcon className="h-3.5 w-3.5 mr-1.5" />
                Importar CSF
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
