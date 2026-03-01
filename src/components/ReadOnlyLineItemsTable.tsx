import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatCurrency";
import type { LineItem } from "@/lib/invoiceUtils";

interface ReadOnlyLineItemsTableProps {
  lineItems: LineItem[];
}

export function ReadOnlyLineItemsTable({ lineItems }: ReadOnlyLineItemsTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-24 text-right">Cant.</TableHead>
              <TableHead className="w-32 text-right">Precio Unit.</TableHead>
              <TableHead className="w-32 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(Number(item.unit_price))}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(Number(item.total))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
