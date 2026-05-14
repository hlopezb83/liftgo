import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/DatePickerField";
import { useUpdatePayment, type Payment } from "@/hooks/usePayments";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const METHODS = [
  { value: "transfer", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "card", label: "Tarjeta" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
}

export function EditPaymentDialog({ open, onOpenChange, payment }: Props) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const updatePayment = useUpdatePayment();

  useEffect(() => {
    if (open && payment) {
      setAmount(String(payment.amount));
      setDate(parseISO(payment.payment_date));
      setMethod(payment.payment_method || "transfer");
      setReference(payment.reference_number || "");
      setNotes(payment.notes || "");
    }
  }, [open, payment]);

  const handleSubmit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Monto inválido"); return; }
    updatePayment.mutate(
      {
        id: payment.id,
        invoice_id: payment.invoice_id,
        amount: amt,
        payment_date: format(date, "yyyy-MM-dd"),
        payment_method: method,
        reference_number: reference || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success("Pago actualizado");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Pago</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-7" />
            </div>
          </div>
          <DatePickerField
            label="Fecha"
            date={date}
            onSelect={(d) => { if (d) setDate(d); }}
          />
          <div>
            <Label>Método de Pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referencia</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Número de referencia bancaria" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={updatePayment.isPending}>
            {updatePayment.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
