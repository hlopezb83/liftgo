import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Download, TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
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

interface MonthData {
  month: string;
  revenue: number;
  maintenanceCost: number;
  damageCost: number;
  grossProfit: number;
  expenses: Record<ExpenseCategory, number>;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

interface StatementRow {
  label: string;
  values: number[];
  total: number;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
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

    invoices
      .filter((inv) => inv.status === "paid" && inv.paid_at)
      .filter((inv) => isWithinInterval(parseISO(inv.paid_at!), { start: startDate, end: endDate }))
      .forEach((inv) => {
        const key = ensureMonth(parseISO(inv.paid_at!));
        months[key].revenue += Number(inv.subtotal);
      });

    maintenanceLogs
      .filter((ml) => isWithinInterval(parseISO(ml.performed_at), { start: startDate, end: endDate }))
      .forEach((ml) => {
        const key = ensureMonth(parseISO(ml.performed_at));
        months[key].maintenanceCost += Number(ml.cost ?? 0);
      });

    damageRecords
      .filter((dr) => isWithinInterval(parseISO(dr.created_at), { start: startDate, end: endDate }))
      .forEach((dr) => {
        const key = ensureMonth(parseISO(dr.created_at));
        months[key].damageCost += Number(dr.actual_cost ?? 0);
      });

    operatingExpenses
      .filter((oe) => isWithinInterval(parseISO(oe.expense_date), { start: startDate, end: endDate }))
      .forEach((oe) => {
        const key = ensureMonth(parseISO(oe.expense_date));
        months[key].expenses[oe.category] += Number(oe.amount);
      });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]): MonthData => {
        const grossProfit = m.revenue - m.maintenanceCost - m.damageCost;
        const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const totalExpenses = m.maintenanceCost + m.damageCost + opexTotal;
        const netProfit = m.revenue - totalExpenses;
        const margin = m.revenue > 0 ? (netProfit / m.revenue) * 100 : 0;
        return { ...m, grossProfit, totalExpenses, netProfit, margin };
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
    const grossProfit = t.revenue - t.maintenanceCost - t.damageCost;
    const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const totalExpenses = t.maintenanceCost + t.damageCost + opexTotal;
    const netProfit = t.revenue - totalExpenses;
    const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
    return { ...t, grossProfit, totalExpenses, netProfit, margin };
  }, [data]);

  // Build statement rows (vertical format)
  const statementRows: StatementRow[] = useMemo(() => [
    { label: "Ingresos", values: data.map((r) => r.revenue), total: totals.revenue, isSubtotal: true },
    { label: "(-) Mantenimiento", values: data.map((r) => r.maintenanceCost), total: totals.maintenanceCost, isCost: true },
    { label: "(-) Daños", values: data.map((r) => r.damageCost), total: totals.damageCost, isCost: true },
    { label: "= Utilidad Bruta", values: data.map((r) => r.grossProfit), total: totals.grossProfit, isSubtotal: true },
    ...EXPENSE_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      values: data.map((r) => r.expenses[c]),
      total: totals.expenses[c],
      isCost: true,
    })),
    { label: "= Total Egresos", values: data.map((r) => r.totalExpenses), total: totals.totalExpenses, isSubtotal: true, isCost: true },
    { label: "= Utilidad Neta", values: data.map((r) => r.netProfit), total: totals.netProfit, isSubtotal: true },
    { label: "Margen Neto", values: data.map((r) => r.margin), total: totals.margin, isPercent: true },
  ], [data, totals]);

  const chartData = data.map((r) => ({
    month: r.month,
    Ingresos: r.revenue,
    Mantenimiento: r.maintenanceCost,
    Daños: r.damageCost,
    Renta: r.expenses.renta,
    Nómina: r.expenses.nomina,
    Software: r.expenses.software,
    Depreciación: r.expenses.depreciacion,
    Otros: r.expenses.otro,
  }));

  const csvRows = statementRows.map((row) => {
    const obj: Record<string, string> = { Concepto: row.label };
    data.forEach((d, i) => {
      obj[d.month] = row.isPercent ? `${row.values[i].toFixed(1)}%` : row.values[i].toFixed(2);
    });
    obj["Total"] = row.isPercent ? `${row.total.toFixed(1)}%` : row.total.toFixed(2);
    return obj;
  });

  const kpis = [
    { label: "Ingresos", value: formatCurrency(totals.revenue), icon: DollarSign, color: "text-chart-2" },
    { label: "Total Egresos", value: formatCurrency(totals.totalExpenses), icon: TrendingDown, color: "text-destructive" },
    { label: "Utilidad Neta", value: formatCurrency(totals.netProfit), icon: TrendingUp, color: totals.netProfit >= 0 ? "text-chart-2" : "text-destructive" },
    { label: "Margen Neto", value: `${totals.margin.toFixed(1)}%`, icon: Percent, color: totals.margin >= 0 ? "text-chart-2" : "text-destructive" },
  ];

  const formatCell = (row: StatementRow, value: number) => {
    if (row.isPercent) return `${value.toFixed(1)}%`;
    return formatCurrency(value);
  };

  const cellColor = (row: StatementRow, value: number) => {
    if (row.isPercent) return value >= 0 ? "" : "text-destructive";
    if (row.label === "= Utilidad Neta") return value >= 0 ? "" : "text-destructive";
    if (row.isCost) return "text-destructive";
    return "";
  };

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">{kpi.label}</p>
                <p className="text-lg font-bold truncate">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stacked Bar Chart */}
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
                <Bar dataKey="Mantenimiento" stackId="costs" fill="hsl(var(--chart-5))" />
                <Bar dataKey="Daños" stackId="costs" fill="hsl(var(--chart-4))" />
                <Bar dataKey="Renta" stackId="costs" fill="hsl(var(--chart-1))" />
                <Bar dataKey="Nómina" stackId="costs" fill="hsl(var(--chart-3))" />
                <Bar dataKey="Software" stackId="costs" fill="hsl(142 71% 45%)" />
                <Bar dataKey="Depreciación" stackId="costs" fill="hsl(280 65% 60%)" />
                <Bar dataKey="Otros" stackId="costs" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Vertical Statement Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concepto</TableHead>
                {data.map((d) => (
                  <TableHead key={d.month} className="text-right min-w-[110px]">{d.month}</TableHead>
                ))}
                <TableHead className="text-right min-w-[120px] font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statementRows.map((row) => (
                <TableRow
                  key={row.label}
                  className={row.isSubtotal ? "bg-muted/40 border-t border-border" : ""}
                >
                  <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
                    {row.label}
                  </TableCell>
                  {row.values.map((val, i) => (
                    <TableCell
                      key={i}
                      className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}
                    >
                      {formatCell(row, val)}
                    </TableCell>
                  ))}
                  <TableCell
                    className={`text-right font-mono font-bold ${cellColor(row, row.total)}`}
                  >
                    {formatCell(row, row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
