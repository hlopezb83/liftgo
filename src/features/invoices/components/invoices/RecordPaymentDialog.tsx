import { useId } from "react";
import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHODS } from "@/features/invoices/lib/paymentMethods";
import { FORMA_PAGO, MONEDA } from "@/lib/domain/satCatalogs";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { nowMty } from "@/lib/utils";
import { useRecordPaymentForm } from "../../hooks/invoices/useRecordPaymentForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  balance: number;
  /** C-1: moneda de la factura. El pago se bloquea a este valor. */
  invoiceCurrency?: string | null;
  /** R7 Bloque 14: tipo de cambio de la factura para prellenar el TC del pago. */
  invoiceExchangeRate?: number | null;
  /** N-34: fecha de emisión (YYYY-MM-DD) para validar la fecha del pago. */
  invoiceIssuedAt?: string | null;
  /** If true, invoice is PPD + stamped => offer REP stamping */
  ppdStamped?: boolean;
}

export function RecordPaymentDialog({ open, onOpenChange, invoiceId, balance, invoiceCurrency, invoiceExchangeRate, invoiceIssuedAt, ppdStamped = false }: Props) {
  const id = useId();
  const {
    amount, setAmount, date, setDate, method, setMethod,
    paymentFormSat, setPaymentFormSat, currency, setCurrency,
    lockedCurrency,
    exchangeRate, setExchangeRate, reference, setReference,
    notes, setNotes, stampRep, setStampRep,
    createPayment, stampComplement, handleSubmit, isDirty,
    amountBlock, exceedsBalance, dateError, currencyError,
  } = useRecordPaymentForm({ open, balance, ppdStamped, invoiceId, invoiceCurrency, invoiceExchangeRate, invoiceIssuedAt, onOpenChange });


  return (
    <FormDialog
      isPending={createPayment.isPending || stampComplement.isPending}
      isDirty={isDirty}
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar pago"
      width="md"
      testId="record-payment-dialog"
    >
      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
      >
        <div className="space-y-4">
          {currencyError && <p role="alert" className="text-sm text-destructive">{currencyError}</p>}
          <div>
            <Label htmlFor={`${id}-amount`}>Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id={`${id}-amount`}
                aria-label="Monto del pago"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Saldo pendiente: {formatCurrency(balance)}</p>
            {amountBlock && <BlockedActionNotice block={amountBlock} className="mt-2" />}
          </div>
          <DatePickerField
            label="Fecha"
            date={date}
            onSelect={setDate}
            required
            invalidateOnPartial
            error={dateError}
            disabled={{ after: nowMty() }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${id}-method`}>Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id={`${id}-method`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-sat`}>Forma de pago SAT</Label>
              <Select value={paymentFormSat} onValueChange={setPaymentFormSat}>
                <SelectTrigger id={`${id}-sat`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_PAGO.map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${id}-currency`}>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency} disabled>
                <SelectTrigger id={`${id}-currency`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDA.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Bloqueada a la moneda de la factura ({lockedCurrency}).
              </p>
            </div>
            <div>
              <Label htmlFor={`${id}-exchange-rate`}>Tipo de cambio</Label>
              <Input
                id={`${id}-exchange-rate`}
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                disabled={currency === "MXN"}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`${id}-reference`}>Referencia</Label>
            <Input id={`${id}-reference`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Número de referencia bancaria" />
          </div>
          <div>
            <Label htmlFor={`${id}-notes`}>Notas</Label>
            <Textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {ppdStamped && (
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
              <Checkbox
                id={`${id}-stamp-rep`}
                checked={stampRep}
                onCheckedChange={(v) => setStampRep(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor={`${id}-stamp-rep`} className="text-sm font-normal cursor-pointer">
                Timbrar Complemento de Pago (REP) automáticamente.
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Obligatorio para facturas PPD según el SAT.
                </span>
              </Label>
            </div>
          )}
        </div>
        <FormDialogFooter>
          <FormDialogCancelButton
            onCancel={() => onOpenChange(false)}
            disabled={createPayment.isPending || stampComplement.isPending}
          />
          <Button
            type="submit"
            data-testid="record-payment-submit"
            disabled={createPayment.isPending || stampComplement.isPending || exceedsBalance || !!dateError || !!currencyError}
          >
            {createPayment.isPending ? "Guardando…" : (stampComplement.isPending ? "Timbrando REP…" : "Registrar pago")}
          </Button>
        </FormDialogFooter>
      </form>
    </FormDialog>
  );
}
