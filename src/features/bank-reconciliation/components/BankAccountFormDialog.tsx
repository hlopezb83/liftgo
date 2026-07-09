import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  TextField,
  NumberField,
  SelectField,
  SwitchField,
  type SelectOption,
} from "@/components/forms/fields";
import { useUpsertBankAccount, type BankAccount } from "../hooks/useBankAccounts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: BankAccount | null;
}

const schema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  bank: z.string().trim().min(1, "El banco es requerido"),
  last4: z
    .string()
    .default("")
    .refine((v) => !v || /^\d{1,4}$/.test(v), { message: "Solo dígitos, máx 4" }),
  currency: z.enum(["MXN", "USD"]).default("MXN"),
  initialBalance: z.number({ invalid_type_error: "Monto inválido" }).default(0),
  isActive: z.boolean().default(true),
  notes: z.string().default(""),
});
type FormValues = z.input<typeof schema>;

const emptyValues: FormValues = {
  name: "", bank: "", last4: "", currency: "MXN",
  initialBalance: 0, isActive: true, notes: "",
};

function valuesFor(initial?: BankAccount | null): FormValues {
  if (!initial) return { ...emptyValues };
  return {
    name: initial.name,
    bank: initial.bank,
    last4: initial.last4 ?? "",
    currency: initial.currency === "USD" ? "USD" : "MXN",
    initialBalance: Number(initial.initial_balance) || 0,
    isActive: initial.is_active,
    notes: initial.notes ?? "",
  };
}

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: "MXN", label: "MXN" },
  { value: "USD", label: "USD" },
];

export function BankAccountFormDialog({ open, onOpenChange, initial }: Props) {
  const upsert = useUpsertBankAccount();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) form.reset(valuesFor(initial));
  }, [open, initial, form]);

  const onSubmit = form.handleSubmit((values) => {
    upsert.mutate(
      {
        id: initial?.id,
        name: values.name.trim(),
        bank: values.bank.trim(),
        last4: (values.last4 ?? "").trim() || null,
        currency: (values.currency ?? "MXN") as "MXN" | "USD",
        initial_balance: Number(values.initialBalance ?? 0) || 0,
        is_active: values.isActive ?? true,
        notes: (values.notes ?? "").trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Identidad" first>
            <TextField
              control={form.control}
              name="name"
              label="Nombre interno"
              required
              placeholder="BBVA Operaciones"
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="bank" label="Banco" required placeholder="BBVA" />
              <TextField control={form.control} name="last4" label="Últimos 4" />
            </div>
          </FormSection>
          <FormSection title="Condiciones">
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                control={form.control}
                name="currency"
                label="Moneda"
                options={CURRENCY_OPTIONS}
              />
              <NumberField
                control={form.control}
                name="initialBalance"
                label="Saldo inicial"
                step={0.01}
                nullOnEmpty={false}
              />
            </div>
            <SwitchField control={form.control} name="isActive" label="Activa" />
          </FormSection>
          <FormSection title="Interno">
            <TextField control={form.control} name="notes" label="Notas" />
          </FormSection>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending || !form.formState.isValid}>
              {initial ? "Guardar" : "Agregar cuenta"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
