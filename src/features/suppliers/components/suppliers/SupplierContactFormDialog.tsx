import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  TextField,
  TextareaField,
  SelectField,
  SwitchField,
  type SelectOption,
} from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { optionalEmail } from "@/lib/schemas";
import {
  SUPPLIER_CONTACT_ROLES,
  useCreateSupplierContact,
  useUpdateSupplierContact,
  type SupplierContact,
} from "../../hooks/useSupplierContacts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  contact: SupplierContact | null;
}

const schema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  role: z.string().default("Principal"),
  email: optionalEmail(),
  phone: z.string().default(""),
  notes: z.string().default(""),
  is_primary: z.boolean().default(false),
});
type FormValues = z.input<typeof schema>;

const empty: FormValues = {
  name: "", role: "Principal", email: "", phone: "", notes: "", is_primary: false,
};

const ROLE_OPTIONS: SelectOption[] = SUPPLIER_CONTACT_ROLES.map((r) => ({ value: r, label: r }));

function nn(v: string): string | null { return v.trim() ? v.trim() : null; }

export function SupplierContactFormDialog({ open, onOpenChange, supplierId, contact }: Props) {
  const create = useCreateSupplierContact();
  const update = useUpdateSupplierContact();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      contact
        ? {
            name: contact.name,
            role: contact.role || "Otro",
            email: contact.email || "",
            phone: contact.phone || "",
            notes: contact.notes || "",
            is_primary: contact.is_primary,
          }
        : empty,
    );
  }, [open, contact, form]);

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      role: values.role || null,
      email: nn(values.email ?? ""),
      phone: nn(values.phone ?? ""),
      notes: nn(values.notes ?? ""),
      is_primary: values.is_primary ?? false,
    };
    if (contact) {
      update.mutate(
        { id: contact.id, supplier_id: supplierId, patch: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(
        { ...payload, supplier_id: supplierId },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? "Editar contacto" : "Nuevo contacto"}
      width="md"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Identidad" first>
            <TextField control={form.control} name="name" label="Nombre" required />
            <div className="grid grid-cols-2 gap-3">
              <SelectField control={form.control} name="role" label="Rol" options={ROLE_OPTIONS} />
              <TextField control={form.control} name="phone" label="Teléfono" />
            </div>
          </FormSection>
          <FormSection title="Contacto">
            <TextField control={form.control} name="email" label="Correo" type="email" />
            <SwitchField
              control={form.control}
              name="is_primary"
              label="Contacto primario"
              description="Solo uno por proveedor."
            />
          </FormSection>
          <FormSection title="Interno">
            <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
          </FormSection>
          <FormDialogFooter>
            <FormActions
              submitLabel={contact ? "Guardar" : "Agregar contacto"}
              isPending={create.isPending || update.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
