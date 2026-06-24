import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { CREDIT_NOTE_MOTIVES as MOTIVES } from "@/lib/domain/creditNoteMotives";
import { useCreditNoteForm } from "../../hooks/creditNotes/useCreditNoteForm";
import { CreditNoteLinesTable } from "./CreditNoteLinesTable";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices">;
  maxCreditable: number;
}

export function CreateCreditNoteDialog({ open, onOpenChange, invoice, maxCreditable }: Props) {
  const f = useCreditNoteForm(invoice, maxCreditable, () => onOpenChange(false));

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) f.reset(); onOpenChange(o); }}
      title="Nueva Nota de Crédito"
      width="2xl"
      description={<>Reduce el saldo de la factura {invoice.invoice_number}. Máximo acreditable:{" "}
        <span className="font-mono font-semibold">{formatCurrency(maxCreditable)}</span></>}
    >


        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Motivo *</Label>
              <Select value={f.motive} onValueChange={f.setMotive}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOTIVES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-xs text-muted-foreground">{m.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referencia interna *</Label>
              <Input
                value={f.reason}
                onChange={(e) => f.setReason(e.target.value)}
                placeholder="Ej: Devolución equipo X el 15-mar"
              />
            </div>
          </div>

          <CreditNoteLinesTable lines={f.lines} onUpdate={f.updateLine} />

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-mono">{formatCurrency(f.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA ({f.taxRate}%):</span>
                <span className="font-mono">{formatCurrency(f.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total NC:</span>
                <span className={`font-mono ${f.exceedsMax ? "text-destructive" : ""}`}>
                  {formatCurrency(f.total)}
                </span>
              </div>
              {f.exceedsMax && (
                <p className="text-xs text-destructive">Excede el saldo acreditable disponible.</p>
              )}
            </div>
          </div>
        </div>

        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={f.isPending}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => f.submit(false)} disabled={!f.canSubmit}>
            Guardar borrador
          </Button>
          <Button onClick={() => f.submit(true)} disabled={!f.canSubmit}>
            {f.isPending ? "Procesando..." : "Guardar y timbrar"}
          </Button>
        </FormDialogFooter>
    </FormDialog>
  );
}
