import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { FormActions } from "@/components/forms/FormActions";
import { Form } from "@/components/ui/form";
import {
  TextField,
  TextareaField,
  SelectField,
  SwitchField,
  type SelectOption,
} from "@/components/forms/fields";
import {
  isValidClabe,
  useCreateSupplierBankAccount,
  useUpdateSupplierBankAccount,
  type SupplierBankAccount,
} from "../../hooks/useSupplierBankAccounts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  account: SupplierBankAccount | null;
}

const schema = z.object({
  bank_name: z.string().trim().min(1, "El banco es requerido"),
  account_holder: z.string().trim().min(1, "El titular es requerido"),
  clabe: z
    .string()
    .default("")
    .refine((v) => !v || isValidClabe(v), { message: "La CLABE debe tener exactamente 18 dígitos" }),
  account_number: z.string().default(""),
  currency: z.enum(["MXN", "USD"]).default("MXN"),
  notes: z.string().default(""),
  is_primary: z.boolean().default(false),
});
type FormValues = z.input<typeof schema>;

const empty: FormValues = {
  bank_name: "", account_holder: "", clabe: "", account_number: "",
  currency: "MXN", notes: "", is_primary: false,
};

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: "MXN", label: "MXN" },
  { value: "USD", label: "USD" },
];

function nn(v: string): string | null { return v.trim() ? v.trim() : null; }

export function SupplierBankAccountFormDialog({ open, onOpenChange, supplierId, account }: Props) {
  const create = useCreateSupplierBankAccount();
  const update = useUpdateSupplierBankAccount();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      account
        ? {
            bank_name: account.bank_name,
            account_holder: account.account_holder,
            clabe: account.clabe || "",
            account_number: account.account_number || "",
            currency: account.currency === "USD" ? "USD" : "MXN",
            notes: account.notes || "",
            is_primary: account.is_primary,
          }
        : empty,
    );
  }, [open, account, form]);

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      bank_name: values.bank_name.trim(),
      account_holder: values.account_holder.trim(),
      clabe: nn(values.clabe ?? ""),
      account_number: nn(values.account_number ?? ""),
      currency: (values.currency ?? "MXN") as "MXN" | "USD",
      notes: nn(values.notes ?? ""),
      is_primary: values.is_primary ?? false,
    };
    if (account) {
      update.mutate(
        { id: account.id, supplier_id: supplierId, patch: payload },
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
      title={account ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
      width="md"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Identidad" first>
            <TextField
              control={form.control}
              name="bank_name"
              label="Banco"
              required
              placeholder="BBVA, Banorte..."
            />
            <TextField
              control={form.control}
              name="account_holder"
              label="Titular"
              required
            />
          </FormSection>
          <FormSection title="Datos bancarios">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                control={form.control}
                name="clabe"
                label="CLABE (18 dígitos)"
                placeholder="012345678901234567"
              />
              <SelectField
                control={form.control}
                name="currency"
                label="Moneda"
                options={CURRENCY_OPTIONS}
              />
            </div>
            <TextField
              control={form.control}
              name="account_number"
              label="Núm. de cuenta (opcional)"
            />
            <SwitchField
              control={form.control}
              name="is_primary"
              label="Cuenta primaria"
              description="Solo una por proveedor."
            />
          </FormSection>
          <FormSection title="Interno">
            <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
          </FormSection>
          <FormDialogFooter>
            <FormActions
              submitLabel={account ? "Guardar" : "Agregar cuenta"}
              isPending={create.isPending || update.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
