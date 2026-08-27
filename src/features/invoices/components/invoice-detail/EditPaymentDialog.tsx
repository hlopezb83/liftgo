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
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import { zodResolver } from "@/lib/forms/zodResolver";
import { roundMoney } from "@/lib/money";
import { positiveAmount } from "@/lib/schemas";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { useUpdatePayment, type Payment } from "../../hooks/usePayments";
import { validateEditPaymentAmount } from "./validateEditPaymentAmount";

const METHODS = [
  { value: "transfer", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "card", label: "Tarjeta" },
];

const schema = z.object({
  amount: positiveAmount("Monto inválido"),
  // R10 Bloque 8.1: fecha de pago no puede ser futura.
  date: z.date().refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
    message: "La fecha del pago no puede ser futura.",
  }),
  method: z.string().min(1),
  reference: z.string().default(""),
  notes: z.string().default(""),
});


type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
  /** Saldo pendiente de la factura (ya incluye este pago). Usado para el tope BL-11. */
  balance: number;
}

export function EditPaymentDialog({ open, onOpenChange, payment, balance }: Props) {
  const updatePayment = useUpdatePayment();
  const isRepStamped = (payment.rep_cfdi_status as string | null) === "stamped";
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
    // BL-11: rechazar sobrepagos al editar. El techo es el saldo actual (que ya
    // incluye este pago) más el monto original del pago editado.
    const validation = validateEditPaymentAmount(values.amount, balance, payment.amount, isRepStamped);
    if (!validation.ok) {
      notifyValidation({
        message: `El monto excede el saldo pendiente más el pago original ($${validation.maxAllowed.toFixed(2)}). Ajusta la cantidad.`,
      });
      return;
    }

    updatePayment.mutate(
      {
        id: payment.id,
        invoice_id: payment.invoice_id,
        // Con REP timbrado el servidor rechaza cambios de monto/fecha; se envían
        // los valores originales para no dar pie a un intento inválido.
        amount: isRepStamped ? payment.amount : roundMoney(values.amount),
        payment_date: isRepStamped ? payment.payment_date : (toYMD(values.date) ?? ""),
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
    <FormDialog
      isPending={updatePayment.isPending}
      isDirty={form.formState.isDirty}
      open={open} onOpenChange={onOpenChange} title="Editar pago" width="md">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {isRepStamped ? (
            <div className="rounded-md bg-warning/10 border border-warning/30 p-2 text-xs text-warning">
              ⚠️ Este pago tiene un Complemento de Pago (REP) timbrado. Monto y Fecha no se pueden modificar; cancela el REP primero si necesitas corregirlos.
            </div>
          ) : null}
          <CurrencyField control={form.control} name="amount" label="Monto" required disabled={isRepStamped} />
          <DateField
            control={form.control}
            name="date"
            label="Fecha"
            required
            disabledMatcher={isRepStamped ? () => true : { after: nowMty() }}
          />
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
            <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={updatePayment.isPending} />
            <Button type="submit" disabled={updatePayment.isPending}>
              {updatePayment.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
