import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { OperatingExpense, ExpenseCategory } from "@/hooks/useOperatingExpenses";
import { EXPENSE_CATEGORY_LABELS } from "@/hooks/useOperatingExpenses";

interface Props {
  invoices: Tables<"invoices">[];
  maintenanceLogs: Tables<"maintenance_logs">[];
  damageRecords: Tables<"damage_records">[];
  operatingExpenses: OperatingExpense[];
  startDate: Date;
  endDate: Date;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["renta", "nomina", "software", "depreciacion", "otro"];

interface MonthRow {
  month: string;
  revenue: number;
  maintenanceCost: number;
  damageCost: number;
  expenses: Record<ExpenseCategory, number>;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

export function IncomeStatementReport({ invoices, maintenanceLogs, damageRecords, operatingExpenses, startDate, endDate }: Props) {
  const data = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; maintenanceCost: number; damageCost: number; expenses: Record<ExpenseCategory, number> }> = {};

    const emptyExpenses = (): Record<ExpenseCategory, number> => ({ renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0 });

    const ensureMonth = (date: Date) => {
      const key = format(startOfMonth(date), "yyyy-MM");
      if (!months[key]) {
        months[key] = {
          month: format(startOfMonth(date), "MMM yyyy", { locale: es }),
          revenue: 0,
          maintenanceCost: 0,
          damageCost: 0,
          expenses: emptyExpenses(),
        };
      }
      return key;
    };

    // Revenue: paid invoices subtotal (sin IVA)
    invoices
      .filter((inv) => inv.status === "paid" && inv.paid_at)
      .filter((inv) => isWithinInterval(parseISO(inv.paid_at!), { start: startDate, end: endDate }))
      .forEach((inv) => {
        const key = ensureMonth(parseISO(inv.paid_at!));
        months[key].revenue += Number(inv.subtotal);
      });

    // Maintenance costs
    maintenanceLogs
      .filter((ml) => isWithinInterval(parseISO(ml.performed_at), { start: startDate, end: endDate }))
      .forEach((ml) => {
        const key = ensureMonth(parseISO(ml.performed_at));
        months[key].maintenanceCost += Number(ml.cost ?? 0);
      });

    // Damage costs
    damageRecords
      .filter((dr) => isWithinInterval(parseISO(dr.created_at), { start: startDate, end: endDate }))
      .forEach((dr) => {
        const key = ensureMonth(parseISO(dr.created_at));
        months[key].damageCost += Number(dr.actual_cost ?? 0);
      });

    // Operating expenses by category
    operatingExpenses
      .filter((oe) => isWithinInterval(parseISO(oe.expense_date), { start: startDate, end: endDate }))
      .forEach((oe) => {
        const key = ensureMonth(parseISO(oe.expense_date));
        months[key].expenses[oe.category] += Number(oe.amount);
      });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]): MonthRow => {
        const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const totalExpenses = m.maintenanceCost + m.damageCost + opexTotal;
        const netProfit = m.revenue - totalExpenses;
        const margin = m.revenue > 0 ? (netProfit / m.revenue) * 100 : 0;
        return { ...m, totalExpenses, netProfit, margin };
      });
  }, [invoices, maintenanceLogs, damageRecords, operatingExpenses, startDate, endDate]);

  const totals = useMemo(() => {
    const t = data.reduce(
      (acc, r) => {
        const expenses = { ...acc.expenses };
        EXPENSE_CATEGORIES.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
        return {
          revenue: acc.revenue + r.revenue,
          maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
          damageCost: acc.damageCost + r.damageCost,
          expenses,
        };
      },
      { revenue: 0, maintenanceCost: 0, damageCost: 0, expenses: { renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0 } as Record<ExpenseCategory, number> }
    );
    const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const totalExpenses = t.maintenanceCost + t.damageCost + opexTotal;
    const netProfit = t.revenue - totalExpenses;
    const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
    return { ...t, totalExpenses, netProfit, margin };
  }, [data]);

  const chartData = data.map((r) => ({
    month: r.month,
    Ingresos: r.revenue,
    Costos: r.totalExpenses,
  }));

  const csvRows = data.map((r) => ({
    Mes: r.month,
    Ingresos: r.revenue.toFixed(2),
    Mantenimiento: r.maintenanceCost.toFixed(2),
    Daños: r.damageCost.toFixed(2),
    ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [EXPENSE_CATEGORY_LABELS[c], r.expenses[c].toFixed(2)])),
    "Utilidad Neta": r.netProfit.toFixed(2),
    "Margen %": r.margin.toFixed(1),
  }));

  const hasOpex = EXPENSE_CATEGORIES.some((c) => totals.expenses[c] > 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Estado de Resultados</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("estado-resultados.csv", csvRows)}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Costos" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
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
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Mantenimiento</TableHead>
                <TableHead className="text-right">Daños</TableHead>
                {hasOpex && EXPENSE_CATEGORIES.filter((c) => totals.expenses[c] > 0).map((c) => (
                  <TableHead key={c} className="text-right">{EXPENSE_CATEGORY_LABELS[c]}</TableHead>
                ))}
                <TableHead className="text-right">Utilidad Neta</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="font-medium">{r.month}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.revenue)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{formatCurrency(r.maintenanceCost)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{formatCurrency(r.damageCost)}</TableCell>
                  {hasOpex && EXPENSE_CATEGORIES.filter((c) => totals.expenses[c] > 0).map((c) => (
                    <TableCell key={c} className="text-right font-mono text-destructive">{formatCurrency(r.expenses[c])}</TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(r.netProfit)}</TableCell>
                  <TableCell className="text-right font-mono">{r.margin.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                <TableCell className="text-right font-mono font-bold">{formatCurrency(totals.revenue)}</TableCell>
                <TableCell className="text-right font-mono font-bold text-destructive">{formatCurrency(totals.maintenanceCost)}</TableCell>
                <TableCell className="text-right font-mono font-bold text-destructive">{formatCurrency(totals.damageCost)}</TableCell>
                {hasOpex && EXPENSE_CATEGORIES.filter((c) => totals.expenses[c] > 0).map((c) => (
                  <TableCell key={c} className="text-right font-mono font-bold text-destructive">{formatCurrency(totals.expenses[c])}</TableCell>
                ))}
                <TableCell className="text-right font-mono font-bold">{formatCurrency(totals.netProfit)}</TableCell>
                <TableCell className="text-right font-mono font-bold">{totals.margin.toFixed(1)}%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
