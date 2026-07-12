import { parseISO } from "date-fns";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  CurrencyField,
  DateField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { roundMoney } from "@/lib/money";
import { positiveAmount } from "@/lib/schemas";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdatePayment, type Payment } from "../../hooks/usePayments";

const METHODS = [
  { value: "transfer", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "card", label: "Tarjeta" },
];

const schema = z.object({
  amount: positiveAmount("Monto inválido"),
  date: z.date(),
  method: z.string().min(1),
  reference: z.string().default(""),
  notes: z.string().default(""),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
}

export function EditPaymentDialog({ open, onOpenChange, payment }: Props) {
  const updatePayment = useUpdatePayment();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: payment.amount,
      date: parseISO(payment.payment_date),
      method: payment.payment_method || "transfer",
      reference: payment.reference_number || "",
      notes: payment.notes || "",
    },
  });

  useEffect(() => {
    if (open && payment) {
      form.reset({
        amount: payment.amount,
        date: parseISO(payment.payment_date),
        method: payment.payment_method || "transfer",
        reference: payment.reference_number || "",
        notes: payment.notes || "",
      });
    }
  }, [open, payment, form]);

  const onSubmit = (values: FormValues) => {
    updatePayment.mutate(
      {
        id: payment.id,
        invoice_id: payment.invoice_id,
        amount: roundMoney(values.amount),
        payment_date: toYMD(values.date) ?? "",
        payment_method: values.method,
        reference_number: values.reference.trim() || null,
        notes: values.notes.trim() || null,
      },
      {
        onSuccess: () => {
          notifySuccess("Pago actualizado");
          onOpenChange(false);
        },
        onError: (err) => notifyError({ error: err }),
      },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Editar Pago" width="md">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <CurrencyField control={form.control} name="amount" label="Monto" required />
          <DateField control={form.control} name="date" label="Fecha" required />
          <SelectField
            control={form.control}
            name="method"
            label="Método de Pago"
            required
            options={METHODS}
          />
          <TextField
            control={form.control}
            name="reference"
            label="Referencia"
            placeholder="Número de referencia bancaria"
          />
          <TextareaField control={form.control} name="notes" label="Notas" rows={2} />

          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updatePayment.isPending}>
              {updatePayment.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
