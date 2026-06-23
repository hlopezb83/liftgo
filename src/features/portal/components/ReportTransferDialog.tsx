import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePaymentIntent } from "../hooks/usePortalExtras";
import { nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";
import { DatePickerField } from "@/components/forms/DatePickerField";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  customerId: string;
  balance: number;
}

export function ReportTransferDialog({ open, onOpenChange, invoiceId, customerId, balance }: Props) {
  const { mutate, isPending } = useCreatePaymentIntent();
  const [transferDate, setTransferDate] = useState<Date | undefined>(() => nowMty());
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [senderBank, setSenderBank] = useState("");
  const [senderLast4, setSenderLast4] = useState("");
  const [trackingKey, setTrackingKey] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const handleSubmit = () => {
    const amt = Number(amount);
    const ymd = toYMD(transferDate);
    if (!Number.isFinite(amt) || amt <= 0 || !ymd) return;
    mutate(
      {
        invoice_id: invoiceId,
        customer_id: customerId,
        amount: amt,
        transfer_date: ymd,
        sender_bank: senderBank.trim() || null,
        sender_last4: senderLast4.trim() || null,
        tracking_key: trackingKey.trim() || null,
        proof_file: proofFile,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar transferencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField label="Fecha" date={transferDate} onSelect={setTransferDate} required />
            <div>
              <Label className="text-xs">Monto (MXN)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Banco emisor</Label>
            <Input value={senderBank} onChange={(e) => setSenderBank(e.target.value)} placeholder="Ej. BBVA, Banorte" />
          </div>
          <div>
            <Label className="text-xs">Últimos 4 dígitos cuenta origen</Label>
            <Input value={senderLast4} maxLength={4} onChange={(e) => setSenderLast4(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label className="text-xs">Clave de rastreo SPEI (opcional)</Label>
            <Input value={trackingKey} onChange={(e) => setTrackingKey(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Comprobante (PDF o imagen, opcional)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>Enviar reporte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

