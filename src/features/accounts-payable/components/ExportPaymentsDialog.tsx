import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useExportablePayables } from "../hooks/useExportablePayables";
import { useCreatePaymentBatch } from "../hooks/useCreatePaymentBatch";
import { downloadPaymentsXlsx, type PaymentExportRow } from "../lib/buildPaymentsXlsx";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RowState {
  selected: boolean;
  amount: number;
}

export function ExportPaymentsDialog({ open, onOpenChange }: Props) {
  const { data: bills, isLoading } = useExportablePayables();
  const createBatch = useCreatePaymentBatch();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const init: Record<string, RowState> = {};
    for (const b of bills ?? []) {
      init[b.id] = {
        selected: b.has_valid_clabe && !b.payment_in_progress_at,
        amount: b.balance,
      };
    }
    setRowState(init);
    setNotes("");
  }, [open, bills]);

  const selected = useMemo(
    () => (bills ?? []).filter((b) => rowState[b.id]?.selected),
    [bills, rowState],
  );

  const total = useMemo(
    () => selected.reduce((acc, b) => acc + (rowState[b.id]?.amount ?? 0), 0),
    [selected, rowState],
  );

  const hasInvalid = selected.some((b) => !b.has_valid_clabe);
  const canExport = selected.length > 0 && !hasInvalid && !createBatch.isPending;

  const toggleAll = (val: boolean) => {
    setRowState((prev) => {
      const next = { ...prev };
      for (const b of bills ?? []) {
        if (b.has_valid_clabe && !b.payment_in_progress_at) {
          next[b.id] = { ...next[b.id], selected: val };
        }
      }
      return next;
    });
  };

  const allEligibleSelected =
    (bills ?? []).filter((b) => b.has_valid_clabe && !b.payment_in_progress_at).length > 0 &&
    (bills ?? [])
      .filter((b) => b.has_valid_clabe && !b.payment_in_progress_at)
      .every((b) => rowState[b.id]?.selected);

  const handleExport = async () => {
    const items = selected.map((b) => ({
      bill_id: b.id,
      amount: Number((rowState[b.id]?.amount ?? b.balance).toFixed(2)),
    }));
    if (items.some((i) => i.amount <= 0)) {
      toast.error("Todos los montos deben ser mayores a 0");
      return;
    }
    try {
      await createBatch.mutateAsync({ items, notes: notes || undefined });
      const rows: PaymentExportRow[] = selected.map((b) => {
        const amount = Number((rowState[b.id]?.amount ?? b.balance).toFixed(2));
        return {
          supplier_name: b.supplier_name,
          supplier_rfc: b.supplier_rfc,
          bank_name: b.bank_name ?? "",
          clabe: b.clabe ?? "",
          account_number: b.account_number,
          account_holder: b.account_holder,
          bill_number: b.bill_number,
          due_date: b.due_date,
          reference: `LIFTGO-${b.bill_number}`,
          concept: b.description ?? b.bill_number,
          amount,
          currency: b.currency,
        };
      });
      const filename = downloadPaymentsXlsx(rows);
      toast.success(`Excel descargado: ${filename}`);
      onOpenChange(false);
    } catch {
      /* notifyError already shown by hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Exportar pagos a Excel
          </DialogTitle>
          <DialogDescription>
            Selecciona las facturas aprobadas a pagar. Se genera un Excel y se registra el lote para auditoría.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (bills ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay facturas aprobadas pendientes de pago.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 w-8">
                    <Checkbox
                      checked={allEligibleSelected}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Seleccionar todas"
                    />
                  </th>
                  <th className="px-2 py-2">Proveedor</th>
                  <th className="px-2 py-2">Banco / CLABE</th>
                  <th className="px-2 py-2">Folio</th>
                  <th className="px-2 py-2">Vence</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                  <th className="px-2 py-2 text-right">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {(bills ?? []).map((b, i) => {
                  const st = rowState[b.id];
                  const blocked = !b.has_valid_clabe;
                  return (
                    <tr
                      key={b.id}
                      className={`border-t ${i % 2 === 1 ? "bg-muted/20" : ""} ${blocked ? "opacity-80" : ""}`}
                    >
                      <td className="px-2 py-1.5 align-middle">
                        <Checkbox
                          checked={st?.selected ?? false}
                          disabled={blocked}
                          onCheckedChange={(v) =>
                            setRowState((p) => ({
                              ...p,
                              [b.id]: { ...p[b.id], selected: Boolean(v), amount: p[b.id]?.amount ?? b.balance },
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{b.supplier_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{b.supplier_rfc ?? "—"}</div>
                      </td>
                      <td className="px-2 py-1.5">
                        {blocked ? (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs">
                            <AlertCircle className="h-3.5 w-3.5" /> Sin CLABE válida
                          </span>
                        ) : (
                          <>
                            <div className="text-xs">{b.bank_name}</div>
                            <div className="text-xs font-mono text-muted-foreground">{b.clabe}</div>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {b.bill_number}
                        {b.payment_in_progress_at && (
                          <Badge variant="outline" className="ml-1 text-[10px]">en proceso</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">{formatDateDisplay(b.due_date)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(b.balance)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0.01}
                          max={b.balance}
                          disabled={blocked || !st?.selected}
                          value={st?.amount ?? b.balance}
                          onChange={(e) =>
                            setRowState((p) => ({
                              ...p,
                              [b.id]: { ...p[b.id], amount: Number(e.target.value), selected: p[b.id]?.selected ?? false },
                            }))
                          }
                          className="h-7 w-28 ml-auto text-right font-mono text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <Label>Notas del lote (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Pagos semana 24" />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 flex flex-col justify-center">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pagos seleccionados</span>
              <span className="font-semibold">{selected.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Total a pagar</span>
              <span className="font-mono font-bold text-lg">{formatCurrency(total)}</span>
            </div>
            {hasInvalid && (
              <p className="text-xs text-destructive mt-1">
                Hay proveedores seleccionados sin CLABE válida.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createBatch.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!canExport}>
            {createBatch.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Descargar Excel ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
