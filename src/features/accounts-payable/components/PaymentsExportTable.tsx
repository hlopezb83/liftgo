import { InfoAlertIcon, SpinnerIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import type { ExportablePayable } from "../hooks/useExportablePayables";

interface RowState {
  selected: boolean;
  amount: number;
}

interface Props {
  bills: ExportablePayable[] | undefined;
  isLoading: boolean;
  rowState: Record<string, RowState>;
  allEligibleSelected: boolean;
  onToggleAll: (val: boolean) => void;
  onToggleRow: (id: string, selected: boolean, fallback: number) => void;
  onChangeAmount: (id: string, amount: number) => void;
}

export function PaymentsExportTable({
  bills, isLoading, rowState, allEligibleSelected,
  onToggleAll, onToggleRow, onChangeAmount,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <SpinnerIcon className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if ((bills ?? []).length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No hay facturas aprobadas pendientes de pago.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0 z-10">
        <tr className="text-left text-xs uppercase text-muted-foreground">
          <th className="px-2 py-2 w-8">
            <Checkbox
              checked={allEligibleSelected}
              onCheckedChange={(v) => onToggleAll(Boolean(v))}
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
                  onCheckedChange={(v) => onToggleRow(b.id, Boolean(v), b.balance)}
                />
              </td>
              <td className="px-2 py-1.5">
                <div className="font-medium">{b.supplier_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{b.supplier_rfc ?? "—"}</div>
              </td>
              <td className="px-2 py-1.5">
                {blocked ? (
                  <span className="inline-flex items-center gap-1 text-destructive text-xs">
                    <InfoAlertIcon className="h-3.5 w-3.5" /> Sin CLABE válida
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
                  onChange={(e) => onChangeAmount(b.id, Number(e.target.value))}
                  className="h-7 w-28 ml-auto text-right font-mono text-xs"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
