import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { creditNoteDiscountForSelection } from "../../lib/creditNoteDiscount";
import type { EditableCreditNoteLine } from "../../hooks/creditNotes/useCreditNoteForm";

interface Props {
  lines: EditableCreditNoteLine[];
  currency?: string;
  onUpdate: (idx: number, patch: Partial<EditableCreditNoteLine>) => void;
  /** Fix 8.1: máximos facturados por línea, para mostrar el hint del tope. */
  lineMax?: (idx: number) => { quantity: number; unit_price: number };
}

export function CreditNoteLinesTable({ lines, onUpdate, lineMax, currency = "MXN" }: Props) {
  const netSubtotal = (line: EditableCreditNoteLine, index: number) => {
    const selectedGross = lineItemTotal(line.quantity, line.unit_price);
    const maximum = lineMax?.(index);
    const originalGross = maximum
      ? lineItemTotal(maximum.quantity, maximum.unit_price)
      : selectedGross;
    const discount = creditNoteDiscountForSelection({
      originalGross,
      selectedGross,
      originalDiscount: line.discount,
      discountType: line.discount_type,
    });
    return applyDiscountToBase(selectedGross, discount, line.discount_type);
  };

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"><span className="sr-only">Seleccionar</span></TableHead>
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
                <Checkbox
                  checked={l._selected}
                  onCheckedChange={(checked) => onUpdate(i, { _selected: checked === true })}
                  aria-label={`Seleccionar partida ${l.description}`}
                />
              </TableCell>
              <TableCell className="text-sm">{l.description}</TableCell>
              <TableCell>
                <Input
                  type="number" min={0} step="0.01"
                  value={l.quantity}
                  max={lineMax?.(i).quantity}
                  disabled={!l._selected}
                  onChange={(e) => onUpdate(i, { quantity: Number(e.target.value) })}
                  aria-label={`Cantidad a acreditar de ${l.description}`}
                  className="h-8 text-right font-mono text-sm [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {lineMax && (
                  <p className="mt-1 text-[11px] text-muted-foreground text-right">
                    Máximo: {lineMax(i).quantity} unidades facturadas
                  </p>
                )}
              </TableCell>
              <TableCell>
                <Input
                  type="number" min={0} step="0.01"
                  value={l.unit_price}
                  max={lineMax?.(i).unit_price}
                  disabled={!l._selected}
                  onChange={(e) => onUpdate(i, { unit_price: Number(e.target.value) })}
                  aria-label={`Precio unitario a acreditar de ${l.description}`}
                  className="h-8 text-right font-mono text-sm [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {lineMax && (
                  <p className="mt-1 text-[11px] text-muted-foreground text-right">
                    Máximo: {formatCurrencyWithCode(lineMax(i).unit_price, currency)} facturado
                  </p>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrencyWithCode(netSubtotal(l, i), currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
