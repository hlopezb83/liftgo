import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
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
        <Upload className="h-4 w-4 mr-1" />Adjuntar archivo
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
            <Label>Comprobante (PDF/JPG/PNG, máx 5 MB)</Label>
            {receiptFile ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="truncate">{receiptFile.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptFile(null)} disabled={isPending}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setReceiptFile(f);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                  <Upload className="h-4 w-4 mr-1" />Adjuntar archivo
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} {...form.register("notes")} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel={uploader.isPending ? "Subiendo…" : "Registrar pago"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}
