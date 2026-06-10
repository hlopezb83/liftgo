import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatCurrency";
import { parseLineItems } from "@/lib/domain/lineItems";
import { useCreateCreditNote } from "@/features/invoices/hooks/creditNotes/useCreditNotes";
import type { Tables } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { CREDIT_NOTE_MOTIVES as MOTIVES } from "@/lib/domain/creditNoteMotives";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices">;
  maxCreditable: number;
}

type EditableLine = LineItem & { _selected: boolean };

export function CreateCreditNoteDialog({ open, onOpenChange, invoice, maxCreditable }: Props) {
  const original = useMemo(() => parseLineItems<LineItem>(invoice.line_items), [invoice.line_items]);
  const [motive, setMotive] = useState<string>("return");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<EditableLine[]>(() =>
    original.map((li) => ({ ...li, _selected: true })),
  );
  const createMutation = useCreateCreditNote();

  const taxRate = Number(invoice.tax_rate) || 0;
  const subtotal = lines
    .filter((l) => l._selected)
    .reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const exceedsMax = total > maxCreditable + 0.01;

  const reset = () => {
    setMotive("return");
    setReason("");
    setLines(original.map((li) => ({ ...li, _selected: true })));
  };

  const submit = (stamp: boolean) => {
    const selectedLines = lines
      .filter((l) => l._selected && Number(l.quantity) > 0 && Number(l.unit_price) > 0)
      .map(({ _selected: _s, ...rest }) => rest);

    createMutation.mutate(
      {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        motive,
        reason_text: reason.trim(),
        line_items: selectedLines as unknown as Tables<"credit_notes">["line_items"],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        currency: invoice.moneda || "MXN",
        stamp,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  const updateLine = (idx: number, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const canSubmit = reason.trim().length > 0 && total > 0 && !exceedsMax && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva Nota de Crédito</DialogTitle>
          <DialogDescription>
            Reduce el saldo de la factura {invoice.invoice_number}. Máximo acreditable:{" "}
            <span className="font-mono font-semibold">{formatCurrency(maxCreditable)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Motivo *</Label>
              <Select value={motive} onValueChange={setMotive}>
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
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Devolución equipo X el 15-mar"
              />
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="w-24 text-right">Cantidad</TableHead>
                  <TableHead className="w-32 text-right">Precio Unit.</TableHead>
                  <TableHead className="w-32 text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i} className={!l._selected ? "opacity-40" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={l._selected}
                        onChange={(e) => updateLine(i, { _selected: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{l.description}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.quantity}
                        disabled={!l._selected}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        className="h-8 text-right font-mono text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.unit_price}
                        disabled={!l._selected}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                        className="h-8 text-right font-mono text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(Number(l.quantity || 0) * Number(l.unit_price || 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-mono">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA ({taxRate}%):</span>
                <span className="font-mono">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total NC:</span>
                <span className={`font-mono ${exceedsMax ? "text-destructive" : ""}`}>
                  {formatCurrency(total)}
                </span>
              </div>
              {exceedsMax && (
                <p className="text-xs text-destructive">Excede el saldo acreditable disponible.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={!canSubmit}>
            Guardar borrador
          </Button>
          <Button onClick={() => submit(true)} disabled={!canSubmit}>
            {createMutation.isPending ? "Procesando..." : "Guardar y timbrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
