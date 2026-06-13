import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { EditableCreditNoteLine } from "@/features/invoices/hooks/creditNotes/useCreditNoteForm";

interface Props {
  lines: EditableCreditNoteLine[];
  onUpdate: (idx: number, patch: Partial<EditableCreditNoteLine>) => void;
}

export function CreditNoteLinesTable({ lines, onUpdate }: Props) {
  return (
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
                  onChange={(e) => onUpdate(i, { _selected: e.target.checked })}
                />
              </TableCell>
              <TableCell className="text-sm">{l.description}</TableCell>
              <TableCell>
                <Input
                  type="number" min={0} step="0.01"
                  value={l.quantity}
                  disabled={!l._selected}
                  onChange={(e) => onUpdate(i, { quantity: Number(e.target.value) })}
                  className="h-8 text-right font-mono text-sm"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number" min={0} step="0.01"
                  value={l.unit_price}
                  disabled={!l._selected}
                  onChange={(e) => onUpdate(i, { unit_price: Number(e.target.value) })}
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
  );
}
