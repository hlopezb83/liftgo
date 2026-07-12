import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextField, CurrencyField, DateField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { positiveAmount } from "@/lib/schemas";
import { nowMty } from "@/lib/utils";
import { useCreatePaymentIntent } from "../hooks/usePortalExtras";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  customerId: string;
  balance: number;
}

const schema = z.object({
  transferDate: z.date({ error: "La fecha es obligatoria" }),
  amount: positiveAmount(),
  senderBank: z.string().default(""),
  senderLast4: z
    .string()
    .default("")
    .refine((v) => !v || /^\d{4}$/.test(v), { message: "Debe ser 4 dígitos" }),
  trackingKey: z.string().default(""),
  proofFile: z
    .custom<File | null>((v) => v === null || v instanceof File, { message: "Archivo inválido" })
    .nullable()
    .default(null),
});
type FormValues = z.input<typeof schema>;

export function ReportTransferDialog({ open, onOpenChange, invoiceId, customerId, balance }: Props) {
  const { mutate, isPending } = useCreatePaymentIntent();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transferDate: nowMty(),
      amount: Number(balance.toFixed(2)),
      senderBank: "",
      senderLast4: "",
      trackingKey: "",
      proofFile: null,
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      transferDate: nowMty(),
      amount: Number(balance.toFixed(2)),
      senderBank: "",
      senderLast4: "",
      trackingKey: "",
      proofFile: null,
    });
  }, [open, balance, form]);

  const onSubmit = form.handleSubmit((values) => {
    const ymd = toYMD(values.transferDate);
    if (!ymd) return;
    mutate(
      {
        invoice_id: invoiceId,
        customer_id: customerId,
        amount: Number(values.amount),
        transfer_date: ymd,
        sender_bank: values.senderBank?.trim() || null,
        sender_last4: values.senderLast4?.trim() || null,
        tracking_key: values.trackingKey?.trim() || null,
        proof_file: values.proofFile ?? null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Reportar transferencia" width="md">
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DateField control={form.control} name="transferDate" label="Fecha" required />
            <CurrencyField control={form.control} name="amount" label="Monto" required currency="MXN" />
          </div>
          <TextField
            control={form.control}
            name="senderBank"
            label="Banco emisor"
            placeholder="Ej. BBVA, Banorte"
          />
          <TextField
            control={form.control}
            name="senderLast4"
            label="Últimos 4 dígitos cuenta origen"
          />
          <TextField
            control={form.control}
            name="trackingKey"
            label="Clave de rastreo SPEI (opcional)"
          />
          <Controller
            control={form.control}
            name="proofFile"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Comprobante (PDF o imagen, opcional)</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
              </FormItem>
            )}
          />
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !form.formState.isValid}>
              Enviar reporte
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
