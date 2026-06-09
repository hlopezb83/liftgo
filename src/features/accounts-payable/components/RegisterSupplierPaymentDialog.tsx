import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { formatCurrency } from "@/lib/formatCurrency";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import { PAYMENT_METHODS } from "../lib/supplierBillConstants";
import { useRegisterSupplierPayment } from "../hooks/useRegisterSupplierPayment";
import { useUploadSupplierReceipt } from "../hooks/useUploadSupplierReceipt";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  balance: number;
}

const schema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  payment_date: z.date(),
  payment_method: z.string().default("transferencia"),
  bank_account: z.string().default(""),
  reference: z.string().default(""),
  receipt_url: z.string().default(""),
  notes: z.string().default(""),
});

type FormData = z.infer<typeof schema>;

export function RegisterSupplierPaymentDialog({
  open, onOpenChange, billId, billNumber, balance,
}: Props) {
  const register = useRegisterSupplierPayment();

  const form = useForm<FormData>({
    resolver: zodResolver(
      schema.refine((d) => d.amount <= balance + 0.0001, {
        message: "El monto no puede ser mayor al saldo",
        path: ["amount"],
      }),
    ),
    defaultValues: {
      amount: balance,
      payment_date: nowMty(),
      payment_method: "transferencia",
      bank_account: "",
      reference: "",
      receipt_url: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: balance,
        payment_date: nowMty(),
        payment_method: "transferencia",
        bank_account: "",
        reference: "",
        receipt_url: "",
        notes: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, balance]);

  const onSubmit = (data: FormData) => {
    register.mutate(
      {
        bill_id: billId,
        amount: data.amount,
        payment_date: toYMD(data.payment_date) ?? "",
        payment_method: data.payment_method || undefined,
        bank_account: data.bank_account || undefined,
        reference: data.reference || undefined,
        receipt_url: data.receipt_url || undefined,
        notes: data.notes || undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago — {billNumber}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-muted/50 p-3 mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Saldo actual</span>
          <span className="font-mono font-bold">{formatCurrency(balance)}</span>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto *</Label>
              <Input type="number" step="0.01" {...form.register("amount")} />
              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              )}
            </div>
            <DatePickerField
              label="Fecha"
              required
              date={form.watch("payment_date")}
              onSelect={(d) => d && form.setValue("payment_date", d)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select
                value={form.watch("payment_method")}
                onValueChange={(v) => form.setValue("payment_method", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta bancaria</Label>
              <Input placeholder="Banco / últimos 4" {...form.register("bank_account")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Referencia</Label>
            <Input placeholder="Folio de transferencia, cheque…" {...form.register("reference")} />
          </div>
          <div className="space-y-1.5">
            <Label>URL del comprobante</Label>
            <Input placeholder="Opcional" {...form.register("receipt_url")} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} {...form.register("notes")} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel="Registrar pago"
              isPending={register.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
