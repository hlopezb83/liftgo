import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XCircle } from "lucide-react";
import { format } from "date-fns";
import { nowMty } from "@/lib/date";
import { LOST_REASONS, type LostReason } from "@/lib/constants/crm";
import type { Prospect } from "@/hooks/useProspects";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { lost_reason: string; closed_at: string; notes: string | null }) => void;
  isPending?: boolean;
}

export function CloseLostDialog({ prospect, open, onOpenChange, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState<LostReason | "">("");
  const [extraNote, setExtraNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setExtraNote("");
    }
  }, [open]);

  if (!prospect) return null;

  const requiresNote = reason === "otro";
  const isValid = reason !== "" && (!requiresNote || extraNote.trim().length > 0);

  const handleConfirm = () => {
    if (!isValid) return;
    const today = format(nowMty(), "yyyy-MM-dd");
    const baseNotes = prospect.notes ? `${prospect.notes}\n\n` : "";
    const reasonLabel = LOST_REASONS.find((r) => r.value === reason)?.label ?? reason;
    const closingNote = `[Cierre Perdido ${today}] Razón: ${reasonLabel}${extraNote ? ` — ${extraNote}` : ""}`;
    onConfirm({
      lost_reason: reason,
      closed_at: new Date().toISOString(),
      notes: `${baseNotes}${closingNote}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Marcar como Perdido
          </DialogTitle>
          <DialogDescription>
            Cerrar deal con <span className="font-medium">{prospect.company_name}</span>. Saldrá del pipeline activo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="lost-reason">Razón de pérdida *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
              <SelectTrigger id="lost-reason">
                <SelectValue placeholder="Selecciona una razón" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lost-note">Nota {requiresNote && "*"}</Label>
            <Textarea
              id="lost-note"
              rows={3}
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder={requiresNote ? "Describe la razón (obligatorio si seleccionaste Otro)" : "Detalles adicionales (opcional)"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending || !isValid}>
            <XCircle className="h-4 w-4 mr-1" />
            Confirmar Perdido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
