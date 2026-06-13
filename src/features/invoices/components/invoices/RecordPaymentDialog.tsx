import { useState, useEffect } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { roundMoney } from "@/lib/money";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreatePayment } from "../../hooks/usePayments";
import { useStampPaymentComplement } from "../../hooks/invoices/cfdi/usePaymentComplement";
import { toast } from "sonner";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { FORMA_PAGO, MONEDA } from "@/lib/domain/satCatalogs";

const METHODS = [
  { value: "transfer", label: "Transferencia", sat: "03" },
  { value: "cash", label: "Efectivo", sat: "01" },
  { value: "check", label: "Cheque", sat: "02" },
  { value: "card", label: "Tarjeta", sat: "04" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  balance: number;
  /** If true, invoice is PPD + stamped => offer REP stamping */
  ppdStamped?: boolean;
}

function useRecordPaymentForm({ open, balance, ppdStamped, invoiceId, onOpenChange }: {
  open: boolean; balance: number; ppdStamped: boolean; invoiceId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [date, setDate] = useState<Date>(nowMty());
  const [method, setMethod] = useState("transfer");
  const [paymentFormSat, setPaymentFormSat] = useState("03");
  const [currency, setCurrency] = useState("MXN");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [stampRep, setStampRep] = useState(true);
  const createPayment = useCreatePayment();
  const stampComplement = useStampPaymentComplement();

  useEffect(() => {
    if (open) {
      setAmount(balance.toFixed(2));
      setStampRep(ppdStamped);
    }
  }, [open, balance, ppdStamped]);

  useEffect(() => {
    const m = METHODS.find((x) => x.value === method);
    if (m) setPaymentFormSat(m.sat);
  }, [method]);

  const handleSubmit = async () => {
    const amt = roundMoney(Number(amount));
    if (!amt || amt <= 0) { notifyError({ message: "Monto inválido" }); return; }
    const exch = Number(exchangeRate) || 1;
    if (currency !== "MXN" && exch <= 0) { notifyError({ message: "Tipo de cambio inválido" }); return; }

    createPayment.mutate(
      {
        invoice_id: invoiceId,
        amount: amt,
        payment_date: format(date, "yyyy-MM-dd"),
        payment_method: method,
        payment_form_sat: paymentFormSat,
        currency,
        exchange_rate: exch,
        reference_number: reference || null,
        notes: notes || null,
      },
      {
        onSuccess: async (created) => {
          toast.success("Pago registrado");
          if (ppdStamped && stampRep && created?.id) {
            stampComplement.mutate(created.id);
          }
          onOpenChange(false);
          setAmount(balance.toFixed(2));
          setReference("");
          setNotes("");
        },
        onError: (err) => notifyError({ error: err }),
      },
    );
  };

  return {
    amount, setAmount, date, setDate, method, setMethod,
    paymentFormSat, setPaymentFormSat, currency, setCurrency,
    exchangeRate, setExchangeRate, reference, setReference,
    notes, setNotes, stampRep, setStampRep,
    createPayment, stampComplement, handleSubmit,
  };
}

export function RecordPaymentDialog({ open, onOpenChange, invoiceId, balance, ppdStamped = false }: Props) {
  const {
    amount, setAmount, date, setDate, method, setMethod,
    paymentFormSat, setPaymentFormSat, currency, setCurrency,
    exchangeRate, setExchangeRate, reference, setReference,
    notes, setNotes, stampRep, setStampRep,
    createPayment, stampComplement, handleSubmit,
  } = useRecordPaymentForm({ open, balance, ppdStamped, invoiceId, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar Pago</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="recordPaymentAmount">Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="recordPaymentAmount"
                aria-label="Monto del pago"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Saldo pendiente: {formatCurrency(balance)}</p>
          </div>
          <DatePickerField label="Fecha" date={date} onSelect={(d) => { if (d) setDate(d); }} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pago SAT</Label>
              <Select value={paymentFormSat} onValueChange={setPaymentFormSat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_PAGO.map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDA.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de cambio</Label>
              <Input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                disabled={currency === "MXN"}
              />
            </div>
          </div>
          <div>
            <Label>Referencia</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Número de referencia bancaria" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {ppdStamped && (
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
              <Checkbox
                id="stampRep"
                checked={stampRep}
                onCheckedChange={(v) => setStampRep(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="stampRep" className="text-sm font-normal cursor-pointer">
                Timbrar Complemento de Pago (REP) automáticamente.
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Obligatorio para facturas PPD según el SAT.
                </span>
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createPayment.isPending || stampComplement.isPending}>
            {createPayment.isPending ? "Guardando..." : (stampComplement.isPending ? "Timbrando REP..." : "Registrar Pago")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
