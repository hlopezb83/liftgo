import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { UploadIcon, X } from "@/components/icons";
import { FormActions } from "@/components/forms/FormActions";
import {
  CurrencyField, DateField, SelectField, TextField, TextareaField, type SelectOption,
} from "@/components/forms/fields";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import { PAYMENT_METHODS } from "../lib/supplierBillConstants";
import { supplierPaymentSchema, type SupplierPaymentFormData } from "../lib/supplierPaymentSchema";
import { useRegisterSupplierPayment } from "../hooks/useRegisterSupplierPayment";
import { useUploadSupplierReceipt } from "../hooks/useUploadSupplierReceipt";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  balance: number;
}

const METHOD_OPTIONS: SelectOption[] = PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }));

const buildDefaults = (balance: number): SupplierPaymentFormData => ({
  amount: balance,
  payment_date: nowMty(),
  payment_method: "transferencia",
  bank_account: "",
  reference: "",
  receipt_url: "",
  notes: "",
});

interface ReceiptFieldProps {
  file: File | null;
  onChange: (f: File | null) => void;
  disabled: boolean;
}

function ReceiptField({ file, onChange, disabled }: ReceiptFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  if (file) {
    return (
      <div className="flex items-center justify-between rounded-md border p-2 text-sm">
        <span className="truncate">{file.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={disabled}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={disabled}>
        <UploadIcon className="h-4 w-4 mr-1" />Adjuntar archivo
      </Button>
    </div>
  );
}

export function RegisterSupplierPaymentDialog({
  open, onOpenChange, billId, billNumber, balance,
}: Props) {
  const register = useRegisterSupplierPayment();
  const uploader = useUploadSupplierReceipt();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const form = useForm<SupplierPaymentFormData>({
    resolver: zodResolver(
      supplierPaymentSchema.refine((d) => d.amount <= balance + 0.0001, {
        message: "El monto no puede ser mayor al saldo",
        path: ["amount"],
      }),
    ),
    defaultValues: buildDefaults(balance),
  });

  useEffect(() => {
    if (open) {
      setReceiptFile(null);
      form.reset(buildDefaults(balance));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, balance]);

  const onSubmit = async (data: SupplierPaymentFormData) => {
    let receipt_url = data.receipt_url || undefined;
    if (receiptFile) {
      const uploaded = await uploader.mutateAsync({ file: receiptFile, billId });
      receipt_url = uploaded.signedUrl;
    }
    register.mutate(
      {
        bill_id: billId,
        amount: data.amount,
        payment_date: toYMD(data.payment_date) ?? "",
        payment_method: data.payment_method || undefined,
        bank_account: data.bank_account || undefined,
        reference: data.reference || undefined,
        receipt_url,
        notes: data.notes || undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const isPending = register.isPending || uploader.isPending;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Registrar pago — ${billNumber}`}>
      <div className="rounded-md bg-muted/50 p-3 mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Saldo actual</span>
        <span className="font-mono font-bold">{formatCurrency(balance)}</span>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField control={form.control} name="amount" label="Monto" required />
            <DateField control={form.control} name="payment_date" label="Fecha" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              control={form.control}
              name="payment_method"
              label="Método"
              options={METHOD_OPTIONS}
            />
            <TextField
              control={form.control}
              name="bank_account"
              label="Cuenta bancaria"
              placeholder="Banco / últimos 4"
            />
          </div>
          <TextField
            control={form.control}
            name="reference"
            label="Referencia"
            placeholder="Folio de transferencia, cheque…"
          />
          <FormItem>
            <FormLabel>Comprobante (PDF/JPG/PNG, máx 5 MB)</FormLabel>
            <FormControl>
              <ReceiptField file={receiptFile} onChange={setReceiptFile} disabled={isPending} />
            </FormControl>
          </FormItem>
          <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
          <FormDialogFooter>
            <FormActions
              submitLabel={uploader.isPending ? "Subiendo…" : "Registrar pago"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
