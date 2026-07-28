import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ParseResult } from "../lib/bankParseUtils";

interface Props {
  result: ParseResult;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BankStatementPreview({ result, isPending, onConfirm, onCancel }: Props) {
  const credits = result.lines.filter((l) => l.signed_amount > 0);
  const charges = result.lines.filter((l) => l.signed_amount < 0);
  const sum = (n: number, v: number) => n + v;
  const totalCredits = credits.map((l) => l.signed_amount).reduce(sum, 0);
  const totalCharges = charges.map((l) => l.signed_amount).reduce(sum, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Vista previa de la importación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Movimientos</p>
            <p className="font-medium tabular-nums">{result.lines.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Abonos</p>
            <p className="font-medium tabular-nums text-emerald-600">{formatCurrency(totalCredits)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cargos</p>
            <p className="font-medium tabular-nums text-destructive">{formatCurrency(totalCharges)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Periodo</p>
            <p className="font-medium">
              {result.periodStart ? formatDateMty(result.periodStart) : "—"} – {result.periodEnd ? formatDateMty(result.periodEnd) : "—"}
            </p>
          </div>
        </div>

        {result.errors.length > 0 && (
          <p className="text-xs text-amber-600">
            {result.errors.length} movimiento(s) se ignorarán por datos inválidos. Primero: {result.errors[0]}
          </p>
        )}

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lines.slice(0, 10).map((l) => (
                <TableRow key={l.hash}>
                  <TableCell className="whitespace-nowrap">{formatDateMty(l.posted_date)}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{l.description}</TableCell>
                  <TableCell className="text-muted-foreground">{l.reference ?? "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${l.signed_amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {formatCurrency(l.signed_amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {result.lines.length > 10 && (
          <p className="text-xs text-muted-foreground">Mostrando 10 de {result.lines.length} movimientos.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Los movimientos ya importados se detectan por fecha, importe, referencia y descripción; si la descripción cambia
          respecto a una importación previa, el movimiento podría duplicarse.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>Confirmar importación</Button>
        </div>
      </CardContent>
    </Card>
  );
}
