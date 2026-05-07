import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trophy } from "lucide-react";
import { format } from "date-fns";
import { nowMty } from "@/lib/date";
import type { Prospect } from "@/hooks/useProspects";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { final_amount: number; closed_at: string; notes: string | null }) => void;
  isPending?: boolean;
}

export function CloseWonDialog({ prospect, open, onOpenChange, onConfirm, isPending }: Props) {
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(format(nowMty(), "yyyy-MM-dd"));
  const [extraNote, setExtraNote] = useState("");

  useEffect(() => {
    if (open && prospect) {
      setAmount(String(prospect.deal_value ?? 0));
      setDate(format(nowMty(), "yyyy-MM-dd"));
      setExtraNote("");
    }
  }, [open, prospect]);

  if (!prospect) return null;

  const handleConfirm = () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return;
    const baseNotes = prospect.notes ? `${prospect.notes}\n\n` : "";
    const closingNote = extraNote ? `[Cierre Ganado ${date}] ${extraNote}` : null;
    onConfirm({
      final_amount: numAmount,
      closed_at: new Date(date).toISOString(),
      notes: closingNote ? `${baseNotes}${closingNote}` : prospect.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-success" />
            Marcar como Ganado
          </DialogTitle>
          <DialogDescription>
            Cerrar deal con <span className="font-medium">{prospect.company_name}</span>. Se moverá fuera del pipeline activo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="final-amount">Monto final cerrado (MXN)</Label>
            <Input
              id="final-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close-date">Fecha de cierre</Label>
            <Input
              id="close-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close-note">Nota (opcional)</Label>
            <Textarea
              id="close-note"
              rows={3}
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="Detalles del cierre, contrato firmado, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || Number(amount) <= 0} className="bg-success hover:bg-success/90 text-success-foreground">
            <Trophy className="h-4 w-4 mr-1" />
            Confirmar Ganado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
