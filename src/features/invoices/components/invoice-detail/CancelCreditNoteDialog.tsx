import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANCELLATION_REASONS } from "@/lib/domain/satCatalogs";
import { useCancelCreditNote, type CreditNote } from "../../hooks/creditNotes/useCreditNotes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNote: CreditNote;
}

export function CancelCreditNoteDialog({ open, onOpenChange, creditNote }: Props) {
  const [motive, setMotive] = useState("02");
  const [substitutionUuid, setSubstitutionUuid] = useState("");
  const cancelMutation = useCancelCreditNote();
  const needsSub = motive === "01";
  const validSub = !needsSub || UUID_RE.test(substitutionUuid.trim());

  const submit = () => {
    cancelMutation.mutate(
      {
        creditNoteId: creditNote.id,
        motive,
        substitutionUuid: needsSub ? substitutionUuid.trim() : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setMotive("02");
          setSubstitutionUuid("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Nota de Crédito {creditNote.credit_note_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Motivo</Label>
            <Select value={motive} onValueChange={setMotive}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSub && (
            <div>
              <Label>UUID de NC sustituta</Label>
              <Input
                value={substitutionUuid}
                onChange={(e) => setSubstitutionUuid(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button variant="destructive" onClick={submit} disabled={cancelMutation.isPending || !validSub}>
            {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
