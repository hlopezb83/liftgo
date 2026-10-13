import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AdminCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Si se indica, pide además una fecha (yyyy-MM-dd). */
  dateLabel?: string;
  initialDate?: string;
  maxDate?: string;
  isPending?: boolean;
  onConfirm: (values: { reason: string; date?: string }) => void;
}

/** Diálogo para correcciones administrativas: siempre exige un motivo. */
export function AdminCorrectionDialog({
  open, onOpenChange, title, description, confirmLabel, destructive,
  dateLabel, initialDate, maxDate, isPending, onConfirm,
}: AdminCorrectionDialogProps) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(initialDate ?? "");
  const needsDate = Boolean(dateLabel);
  const canSubmit = reason.trim().length >= 5 && (!needsDate || date !== "") && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {needsDate && (
            <div className="space-y-2">
              <Label htmlFor="correction-date">{dateLabel}</Label>
              <Input id="correction-date" type="date" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="correction-reason">Motivo de la corrección</Label>
            <Textarea
              id="correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Se capturó con fecha equivocada"
            />
            <p className="text-xs text-muted-foreground">Queda registrado en la bitácora con tu usuario.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!canSubmit}
            onClick={() => onConfirm({ reason: reason.trim(), date: needsDate ? date : undefined })}
          >
            {isPending ? "Guardando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
