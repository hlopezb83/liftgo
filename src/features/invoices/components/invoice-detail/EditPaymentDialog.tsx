import { parseISO } from "date-fns";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
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
import { FORMA_PAGO } from "@/lib/domain/satCatalogs";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { zodResolver } from "@/lib/forms/zodResolver";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { positiveAmount } from "@/lib/schemas";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { useUpdatePayment, type Payment } from "../../hooks/usePayments";
import { roundCurrencyAmount } from "../../lib/paymentCurrency";
import { PAYMENT_METHODS, satCodeForMethod } from "../../lib/paymentMethods";
import { validateEditPaymentAmount } from "./validateEditPaymentAmount";

const schema = z.object({
  amount: positiveAmount("Monto inválido"),
  // R10 Bloque 8.1: fecha de pago no puede ser futura.
  date: z.date().refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
    message: "La fecha del pago no puede ser futura.",
  }),
  method: z.string().min(1),
  paymentFormSat: z.string(),
  reference: z.string().default(""),
  notes: z.string().default(""),
});


type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
  /** Saldo pendiente en moneda de factura (ya incluye este pago). */
  balance: number;
  invoiceCurrency?: string | null;
  invoiceExchangeRate?: number | string | null;
}

export function EditPaymentDialog({ open, onOpenChange, payment, balance, invoiceCurrency, invoiceExchangeRate }: Props) {
  const updatePayment = useUpdatePayment();
  const isRepStamped = (payment.rep_cfdi_status as string | null) === "stamped";
  const initialPaymentFormSat = payment.payment_form_sat ?? "";
  const paymentCurrency = (payment.currency ?? invoiceCurrency ?? "MXN").toUpperCase();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: payment.amount,
      date: parseISO(payment.payment_date),
      method: payment.payment_method || "transfer",
      paymentFormSat: initialPaymentFormSat,
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
        paymentFormSat: initialPaymentFormSat,
        reference: payment.reference_number || "",
        notes: payment.notes || "",
      });
    }
  }, [open, payment, form, initialPaymentFormSat]);

  const selectedMethod = useWatch({ control: form.control, name: "method" });

  const onSubmit = (values: FormValues) => {
    const amount = isRepStamped ? payment.amount : roundCurrencyAmount(values.amount);
    if (amount === null) {
      notifyValidation({ message: "Ingresa un monto válido." });
      return;
    }
    // BL-11: rechazar sobrepagos al editar. El techo es el saldo actual (que ya
    // incluye este pago) más el monto original del pago editado.
    const validation = validateEditPaymentAmount(values.amount, balance, payment.amount, isRepStamped, {
      invoiceCurrency, invoiceExchangeRate, paymentCurrency, paymentExchangeRate: payment.exchange_rate,
    });
    if (!validation.ok) {
      notifyValidation({
        message: "reason" in validation
          ? "No se puede validar el monto sin un tipo de cambio válido del pago y la factura. Revisa los tipos de cambio."
          : `El monto convertido excede el saldo disponible. Referencia en moneda de pago: ${formatCurrencyWithCode(validation.maxAllowed, paymentCurrency)} ${paymentCurrency}. Ajusta la cantidad.`,
      });
      return;
    }

    updatePayment.mutate(
      {
        id: payment.id,
        invoice_id: payment.invoice_id,
        // Con REP timbrado el servidor rechaza cambios de monto/fecha; se envían
        // los valores originales para no dar pie a un intento inválido.
        amount,
        payment_date: isRepStamped ? payment.payment_date : (toYMD(values.date) ?? ""),
        payment_method: isRepStamped ? payment.payment_method : values.method,
        // Patch reviewed changes only; notes must neither infer a missing SAT
        // code nor rewrite stamped fiscal data.
        ...(!isRepStamped && values.paymentFormSat && values.paymentFormSat !== payment.payment_form_sat
          ? { payment_form_sat: values.paymentFormSat }
          : {}),
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
            <BlockedActionNotice block={describeBusinessBlock("payment_rep_stamped_locked")} />
          ) : null}
          <CurrencyField control={form.control} name="amount" label="Monto" currency={paymentCurrency as "MXN" | "USD"} required disabled={isRepStamped} />
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
            options={PAYMENT_METHODS.map(({ value, label }) => ({ value, label }))}
            disabled={isRepStamped}
            onValueChange={(method) => {
              // Suggest only on an actual method change, never on save or a
              // same-method selection that would erase an explicit 28/29.
              if (!isRepStamped && method && method !== selectedMethod) {
                form.setValue("paymentFormSat", satCodeForMethod(method), { shouldDirty: true, shouldValidate: true });
              }
            }}
          />
          <SelectField
            control={form.control}
            name="paymentFormSat"
            label="Forma de pago SAT"
            options={FORMA_PAGO.map(({ code, label }) => ({ value: code, label }))}
            disabled={isRepStamped}
            description={isRepStamped ? undefined : "Revisa la clave del comprobante; tarjeta admite crédito, débito o servicios."}
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
