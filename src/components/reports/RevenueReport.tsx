import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Download } from "lucide-react";
import { useInvoices } from "@/hooks/useInvoices";

interface Props {
  startDate: Date;
  endDate: Date;
}

export function RevenueReport({ startDate, endDate }: Props) {
  const { data: invoices = [] } = useInvoices();
  const data = useMemo(() => {
    const filtered = invoices.filter((inv) => isWithinInterval(parseISO(inv.issued_at), { start: startDate, end: endDate }));
    const months: Record<string, { month: string; invoiced: number; paid: number; count: number }> = {};
    filtered.forEach((inv) => {
      const key = format(startOfMonth(parseISO(inv.issued_at)), "yyyy-MM");
      const label = format(startOfMonth(parseISO(inv.issued_at)), "MMM yyyy", { locale: es });
      if (!months[key]) months[key] = { month: label, invoiced: 0, paid: 0, count: 0 };
      months[key].invoiced += Number(inv.total);
      months[key].count++;
      if (inv.status === "paid") months[key].paid += Number(inv.total);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => d);
  }, [invoices, startDate, endDate]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ingresos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("reporte-ingresos.csv", data)}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Bar dataKey="invoiced" fill="hsl(var(--chart-3))" name="Facturado" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" fill="hsl(var(--chart-2))" name="Pagado" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Facturas</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="font-medium">{r.month}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.invoiced)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.paid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}