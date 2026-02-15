import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePayment } from "@/hooks/usePayments";
import { toast } from "sonner";

const METHODS = [
  { value: "transfer", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "card", label: "Tarjeta" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  balance: number;
}

export function RecordPaymentDialog({ open, onOpenChange, invoiceId, balance }: Props) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const createPayment = useCreatePayment();

  const handleSubmit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Monto inválido"); return; }
    createPayment.mutate(
      { invoice_id: invoiceId, amount: amt, payment_date: date, payment_method: method, reference_number: reference || null, notes: notes || null },
      {
        onSuccess: () => {
          toast.success("Pago registrado");
          onOpenChange(false);
          setAmount(balance.toFixed(2));
          setReference("");
          setNotes("");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar Pago</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Monto</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
          <Button onClick={handleSubmit} disabled={createPayment.isPending}>
            {createPayment.isPending ? "Guardando..." : "Registrar Pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
