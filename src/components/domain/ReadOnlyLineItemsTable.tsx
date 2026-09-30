import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyDiscount } from "@/lib/domain/invoiceHelpers";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface ReadOnlyLineItemsTableProps {
  lineItems: LineItem[];
  currency?: string;
}

function formatLineDiscount(item: LineItem, currency: string): string {
  if (!item.discount || item.discount <= 0) return "—";
  if (item.discount_type === "$") return `-${formatCurrencyWithCode(item.discount, currency)}`;
  return `-${item.discount}%`;
}

export function ReadOnlyLineItemsTable({ lineItems, currency = "MXN" }: ReadOnlyLineItemsTableProps) {
  const hasDiscount = lineItems.some((item) => item.discount && item.discount > 0);

  return (
    <Card>
      <CardContent className="p-0">
        <div data-testid="line-items-mobile" className="divide-y sm:hidden">
          {lineItems.map((item, idx) => (
            <div key={idx} className="space-y-2 p-4 text-sm">
              <p className="font-medium break-words">{item.description}</p>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>Cant. {item.quantity ?? (item as unknown as Record<string, unknown>).qty as number ?? 1}</span>
                <span>Unit. {formatCurrencyWithCode(Number(item.unit_price), currency)}</span>
              </div>
              {hasDiscount && item.discount && item.discount > 0 ? (
                <p className="text-right text-destructive">Descuento {formatLineDiscount(item, currency)}</p>
              ) : null}
              <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
                <span>{hasDiscount ? "Importe neto" : "Total"}</span>
                <span className="font-mono text-right">{formatCurrencyWithCode(applyDiscount(item), currency)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-24 text-right">Cant.</TableHead>
              <TableHead className="w-32 text-right">Precio Unit.</TableHead>
              {hasDiscount && <TableHead className="w-28 text-right">Descuento</TableHead>}
              <TableHead className="w-32 text-right">{hasDiscount ? "Importe neto" : "Total"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell>{item.description}</TableCell>
                {/* R12-FE-04 (P2 r11): partidas legacy usan `qty`. */}
                <TableCell className="text-right">
                  {item.quantity ?? (item as unknown as Record<string, unknown>).qty as number ?? 1}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrencyWithCode(Number(item.unit_price), currency)}</TableCell>
                {hasDiscount && (
                  <TableCell className="text-right text-destructive font-mono">
                    {formatLineDiscount(item, currency)}
                  </TableCell>
                )}
                <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrencyWithCode(applyDiscount(item), currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
