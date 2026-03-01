import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Tables } from "@/integrations/supabase/types";

interface InvoicePaymentSummaryProps {
  totalPaid: number;
  balance: number;
  payments: Tables<"payments">[];
}

export function InvoicePaymentSummary({ totalPaid, balance, payments }: InvoicePaymentSummaryProps) {
  return (
    <>
      {totalPaid > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pagado</p>
                <p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                <p className={`text-lg font-mono font-bold ${balance <= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(balance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.payment_date}</TableCell>
                    <TableCell className="text-sm capitalize">{p.payment_method || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference_number || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(p.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
