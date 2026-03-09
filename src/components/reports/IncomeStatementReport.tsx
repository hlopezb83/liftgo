import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ReferenceLine, Area, AreaChart,
} from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, parseISO, isWithinInterval, startOfMonth, eachMonthOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { Download, TrendingUp, TrendingDown, DollarSign, Percent, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import { fetchCompanyDataAndLogo } from "@/lib/pdfHelpers";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import type { OperatingExpense, ExpenseCategory } from "@/hooks/useOperatingExpenses";
import { EXPENSE_CATEGORY_LABELS } from "@/hooks/useOperatingExpenses";

interface Props {
  invoices: Tables<"invoices">[];
  maintenanceLogs: Tables<"maintenance_logs">[];
  damageRecords: Tables<"damage_records">[];
  operatingExpenses: OperatingExpense[];
  bookings: Tables<"bookings">[];
  forklifts: Tables<"forklifts">[];
  startDate: Date;
  endDate: Date;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["renta", "nomina", "software", "depreciacion", "otro"];
const DIRECT_COST_CATEGORIES: ExpenseCategory[] = ["costo_venta"];

interface MonthData {
  monthKey: string;
  month: string;
  revenue: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  grossProfit: number;
  grossMargin: number;
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

// ─── Year-over-Year comparison types ──────────────────
interface YearTotals {
  year: string;
  revenue: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  expenses: Record<ExpenseCategory, number>;
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

interface ComparisonRow {
  label: string;
  yearValues: number[];
  delta: number;
  deltaPct: number | null;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export function IncomeStatementReport({ invoices, maintenanceLogs, damageRecords, operatingExpenses, bookings, forklifts, startDate, endDate }: Props) {
  // Build a map of forklift_id → monthly depreciation (acquisition_cost / 36)
  const forkliftDepreciationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const fl of forklifts) {
      const cost = Number((fl as any).acquisition_cost ?? 0);
      if (cost > 0) map.set(fl.id, cost / 36);
    }
    return map;
  }, [forklifts]);

  const data = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; maintenanceCost: number; damageCost: number; expenses: Record<ExpenseCategory, number> }> = {};

    const emptyExpenses = (): Record<ExpenseCategory, number> => ({ renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0, costo_venta: 0 });

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

    // Calculate depreciation per month based on active rentals
    const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, m]): MonthData => {
        // Find forklifts with active rentals in this month
        const monthStart = `${key}-01`;
        const [yyyy, mm] = key.split("-").map(Number);
        const lastDay = new Date(yyyy, mm, 0).getDate();
        const monthEnd = `${key}-${String(lastDay).padStart(2, "0")}`;

        const rentedForkliftIds = new Set<string>();
        for (const b of activeBookings) {
          if (b.start_date <= monthEnd && b.end_date >= monthStart) {
            rentedForkliftIds.add(b.forklift_id);
          }
        }

        let depreciation = 0;
        for (const fid of rentedForkliftIds) {
          depreciation += forkliftDepreciationMap.get(fid) ?? 0;
        }

        const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const grossProfit = m.revenue - m.maintenanceCost - m.damageCost - costoVenta;
        const grossMargin = m.revenue > 0 ? (grossProfit / m.revenue) * 100 : 0;
        const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const totalExpenses = m.maintenanceCost + m.damageCost + costoVenta + opexTotal;
        const netProfit = m.revenue - totalExpenses - depreciation;
        const margin = m.revenue > 0 ? (netProfit / m.revenue) * 100 : 0;
        return { ...m, monthKey: key, depreciation, grossProfit, grossMargin, totalExpenses, netProfit, margin };
      });
  }, [invoices, maintenanceLogs, damageRecords, operatingExpenses, bookings, forkliftDepreciationMap, startDate, endDate]);

  // Year filter
  const availableYears = useMemo(() => {
    return [...new Set(data.map((d) => d.monthKey.substring(0, 4)))].sort();
  }, [data]);

  const [selectedYear, setSelectedYear] = useState<string>("all");

  const isComparison = selectedYear === "compare";

  const filteredData = useMemo(() => {
    if (selectedYear === "all" || selectedYear === "compare") return data;
    return data.filter((d) => d.monthKey.startsWith(selectedYear));
  }, [data, selectedYear]);

  const totals = useMemo(() => {
    const allCats = [...EXPENSE_CATEGORIES, ...DIRECT_COST_CATEGORIES];
    const t = filteredData.reduce(
      (acc, r) => {
        const expenses = { ...acc.expenses };
        allCats.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
        return {
          revenue: acc.revenue + r.revenue,
          maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
          damageCost: acc.damageCost + r.damageCost,
          depreciation: acc.depreciation + r.depreciation,
          expenses,
        };
      },
      { revenue: 0, maintenanceCost: 0, damageCost: 0, depreciation: 0, expenses: { renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0, costo_venta: 0 } as Record<ExpenseCategory, number> }
    );
    const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const grossProfit = t.revenue - t.maintenanceCost - t.damageCost - costoVenta;
    const grossMargin = t.revenue > 0 ? (grossProfit / t.revenue) * 100 : 0;
    const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const totalExpenses = t.maintenanceCost + t.damageCost + costoVenta + opexTotal;
    const netProfit = t.revenue - totalExpenses - t.depreciation;
    const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
    return { ...t, grossProfit, grossMargin, totalExpenses, netProfit, margin };
  }, [filteredData]);

  // ─── Year-over-Year comparison ──────────────────────
  const yearTotals = useMemo((): YearTotals[] => {
    if (!isComparison) return [];
    return availableYears.map((year) => {
      const yearData = data.filter((d) => d.monthKey.startsWith(year));
      const allCats = [...EXPENSE_CATEGORIES, ...DIRECT_COST_CATEGORIES];
      const t = yearData.reduce(
        (acc, r) => {
          const expenses = { ...acc.expenses };
          allCats.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
          return { revenue: acc.revenue + r.revenue, maintenanceCost: acc.maintenanceCost + r.maintenanceCost, damageCost: acc.damageCost + r.damageCost, depreciation: acc.depreciation + r.depreciation, expenses };
        },
        { revenue: 0, maintenanceCost: 0, damageCost: 0, depreciation: 0, expenses: { renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0, costo_venta: 0 } as Record<ExpenseCategory, number> }
      );
      const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
      const grossProfit = t.revenue - t.maintenanceCost - t.damageCost - costoVenta;
      const grossMargin = t.revenue > 0 ? (grossProfit / t.revenue) * 100 : 0;
      const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
      const totalExpenses = t.maintenanceCost + t.damageCost + costoVenta + opexTotal;
      const netProfit = t.revenue - totalExpenses - t.depreciation;
      const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
      return { year, ...t, grossProfit, grossMargin, totalExpenses, netProfit, margin };
    });
  }, [isComparison, availableYears, data]);

  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (yearTotals.length < 2) return [];
    const getValues = (extractor: (yt: YearTotals) => number, opts?: { isCost?: boolean; isSubtotal?: boolean; isPercent?: boolean }) => {
      const vals = yearTotals.map(extractor);
      const last = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      const delta = last - prev;
      const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
      return { yearValues: vals, delta, deltaPct, ...opts };
    };
    return [
      { label: "Ingresos", ...getValues((yt) => yt.revenue, { isSubtotal: true }) },
      { label: "(-) Mantenimiento", ...getValues((yt) => yt.maintenanceCost, { isCost: true }) },
      { label: "(-) Daños", ...getValues((yt) => yt.damageCost, { isCost: true }) },
      ...DIRECT_COST_CATEGORIES.map((c) => ({
        label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        ...getValues((yt) => yt.expenses[c], { isCost: true }),
      })),
      { label: "= Utilidad Bruta", ...getValues((yt) => yt.grossProfit, { isSubtotal: true }) },
      { label: "Margen Bruto", ...getValues((yt) => yt.grossMargin, { isPercent: true }) },
      ...EXPENSE_CATEGORIES.map((c) => ({
        label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        ...getValues((yt) => yt.expenses[c], { isCost: true }),
      })),
      { label: "(-) Depreciación (Equipos Rentados)", ...getValues((yt) => yt.depreciation, { isCost: true }) },
      { label: "= Total Egresos", ...getValues((yt) => yt.totalExpenses + yt.depreciation, { isSubtotal: true, isCost: true }) },
      { label: "= Utilidad Neta", ...getValues((yt) => yt.netProfit, { isSubtotal: true }) },
      { label: "Margen Neto", ...getValues((yt) => yt.margin, { isPercent: true }) },
    ];
  }, [yearTotals]);

  // Build statement rows (vertical format) — now with Gross Margin
  const statementRows: StatementRow[] = useMemo(() => [
    { label: "Ingresos", values: filteredData.map((r) => r.revenue), total: totals.revenue, isSubtotal: true },
    { label: "(-) Mantenimiento", values: filteredData.map((r) => r.maintenanceCost), total: totals.maintenanceCost, isCost: true },
    { label: "(-) Daños", values: filteredData.map((r) => r.damageCost), total: totals.damageCost, isCost: true },
    ...DIRECT_COST_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      values: filteredData.map((r) => r.expenses[c]),
      total: totals.expenses[c],
      isCost: true,
    })),
    { label: "= Utilidad Bruta", values: filteredData.map((r) => r.grossProfit), total: totals.grossProfit, isSubtotal: true },
    { label: "Margen Bruto", values: filteredData.map((r) => r.grossMargin), total: totals.grossMargin, isPercent: true },
    ...EXPENSE_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      values: filteredData.map((r) => r.expenses[c]),
      total: totals.expenses[c],
      isCost: true,
    })),
    { label: "(-) Depreciación (Equipos Rentados)", values: filteredData.map((r) => r.depreciation), total: totals.depreciation, isCost: true },
    { label: "= Total Egresos", values: filteredData.map((r) => r.totalExpenses + r.depreciation), total: totals.totalExpenses + totals.depreciation, isSubtotal: true, isCost: true },
    { label: "= Utilidad Neta", values: filteredData.map((r) => r.netProfit), total: totals.netProfit, isSubtotal: true },
    { label: "Margen Neto", values: filteredData.map((r) => r.margin), total: totals.margin, isPercent: true },
  ], [filteredData, totals]);

  const chartData = filteredData.map((r) => ({
    month: r.month,
    Ingresos: r.revenue,
    Mantenimiento: r.maintenanceCost,
    Daños: r.damageCost,
    "Costo de Venta": r.expenses.costo_venta,
    Renta: r.expenses.renta,
    Nómina: r.expenses.nomina,
    Software: r.expenses.software,
    "Depr. Contable": r.expenses.depreciacion,
    "Depr. Equipos": r.depreciation,
    Otros: r.expenses.otro,
  }));

  const netProfitChartData = filteredData.map((r) => ({
    month: r.month,
    "Utilidad Neta": r.netProfit,
  }));

  const csvRows = statementRows.map((row) => {
    const obj: Record<string, string> = { Concepto: row.label };
    filteredData.forEach((d, i) => {
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

  const formatCell = (row: StatementRow | ComparisonRow, value: number) => {
    if (row.isPercent) return `${value.toFixed(1)}%`;
    return formatCurrency(value);
  };

  const cellColor = (row: StatementRow | ComparisonRow, value: number) => {
    if (row.isPercent) return value >= 0 ? "" : "text-destructive";
    if (row.label === "= Utilidad Neta") return value >= 0 ? "" : "text-destructive";
    if (row.isCost) return "text-destructive";
    return "";
  };

  // ─── PDF Export ─────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const { company, logoBase64 } = await fetchCompanyDataAndLogo();
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 16;

      // Header with logo
      const textStartX = logoBase64 ? margin + 22 : margin;
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", margin, y - 4, 18, 18);
      }
      doc.setFontSize(16);
      doc.setTextColor(232, 89, 12);
      doc.text(company?.razon_social || "LiftGo", textStartX, y);
      doc.setFontSize(8);
      doc.setTextColor(102, 102, 102);
      if (company) {
        doc.text(`RFC: ${company.rfc} | ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`, textStartX, y + 5);
      }

      doc.setFontSize(14);
      doc.setTextColor(51, 51, 51);
      doc.text("Estado de Resultados", pageWidth - margin, y, { align: "right" });
      doc.setFontSize(9);
      const periodLabel = selectedYear === "all" ? `${format(startDate, "dd/MM/yyyy")} — ${format(endDate, "dd/MM/yyyy")}` : selectedYear === "compare" ? `Comparativo: ${availableYears.join(" vs ")}` : `Año ${selectedYear}`;
      doc.text(periodLabel, pageWidth - margin, y + 6, { align: "right" });

      y += 22;

      // Determine columns
      const rows = isComparison ? comparisonRows : statementRows;
      const colHeaders = isComparison
        ? [...yearTotals.map((yt) => yt.year), "Var. $", "Var. %"]
        : [...filteredData.map((d) => d.month), "Total"];

      const labelColW = 50;
      const availableW = pageWidth - margin * 2 - labelColW;
      const colW = Math.min(availableW / colHeaders.length, 28);

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, pageWidth - margin * 2, 8, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Concepto", margin + 2, y);
      colHeaders.forEach((h, i) => {
        doc.text(h, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
      });

      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;

      // Rows
      doc.setFontSize(7);
      for (const row of rows) {
        // Check page overflow
        if (y > doc.internal.pageSize.getHeight() - 15) {
          doc.addPage();
          y = 16;
        }

        if (row.isSubtotal) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y - 3.5, pageWidth - margin * 2, 6, "F");
          doc.setFont("helvetica", "bold");
        } else {
          doc.setFont("helvetica", "normal");
        }

        doc.setTextColor(51, 51, 51);
        doc.text(row.label, margin + 2, y);

        if (isComparison) {
          const cr = row as ComparisonRow;
          cr.yearValues.forEach((val, i) => {
            if (cr.isCost || (cr.label === "= Utilidad Neta" && val < 0)) doc.setTextColor(220, 50, 50);
            else doc.setTextColor(51, 51, 51);
            const txt = cr.isPercent ? `${val.toFixed(1)}%` : formatCurrency(val);
            doc.text(txt, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
          });
          // Delta $
          const deltaIdx = cr.yearValues.length;
          doc.setTextColor(cr.delta >= 0 ? 34 : 220, cr.delta >= 0 ? 139 : 50, cr.delta >= 0 ? 34 : 50);
          const deltaTxt = cr.isPercent ? `${cr.delta >= 0 ? "+" : ""}${cr.delta.toFixed(1)} pp` : `${cr.delta >= 0 ? "+" : ""}${formatCurrency(cr.delta)}`;
          doc.text(deltaTxt, margin + labelColW + colW * deltaIdx + colW - 2, y, { align: "right" });
          // Delta %
          const pctTxt = cr.deltaPct !== null ? `${cr.deltaPct >= 0 ? "+" : ""}${cr.deltaPct.toFixed(1)}%` : "—";
          if (cr.deltaPct !== null) doc.setTextColor(cr.deltaPct >= 0 ? 34 : 220, cr.deltaPct >= 0 ? 139 : 50, cr.deltaPct >= 0 ? 34 : 50);
          else doc.setTextColor(150, 150, 150);
          doc.text(pctTxt, margin + labelColW + colW * (deltaIdx + 1) + colW - 2, y, { align: "right" });
        } else {
          const sr = row as StatementRow;
          sr.values.forEach((val, i) => {
            if (sr.isCost || (sr.label === "= Utilidad Neta" && val < 0)) doc.setTextColor(220, 50, 50);
            else doc.setTextColor(51, 51, 51);
            const txt = sr.isPercent ? `${val.toFixed(1)}%` : formatCurrency(val);
            doc.text(txt, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
          });
          // Total column
          const totalIdx = sr.values.length;
          doc.setFont("helvetica", "bold");
          if (sr.isCost || (sr.label === "= Utilidad Neta" && sr.total < 0)) doc.setTextColor(220, 50, 50);
          else doc.setTextColor(51, 51, 51);
          const totalTxt = sr.isPercent ? `${sr.total.toFixed(1)}%` : formatCurrency(sr.total);
          doc.text(totalTxt, margin + labelColW + colW * totalIdx + colW - 2, y, { align: "right" });
        }

        y += 2;
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.15);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;
      }

      doc.save(`estado-resultados${selectedYear !== "all" ? `-${selectedYear}` : ""}.pdf`);
      toast.success("PDF descargado");
    } catch (err) {
      toast.error("Error al generar PDF");
      console.error(err);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      {/* KPI Cards */}
      {!isComparison && (
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
      )}

      {/* Stacked Bar Chart + Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Estado de Resultados</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {availableYears.length > 1 && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                  <SelectItem value="compare">Comparativo</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => exportToCsv("estado-resultados.csv", csvRows)}>
              <Download className="h-4 w-4 mr-1" />CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={pdfLoading}>
              <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando..." : "PDF"}
            </Button>
          </div>
        </CardHeader>
        {!isComparison && (
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
                  <Bar dataKey="Costo de Venta" stackId="costs" fill="hsl(30 80% 55%)" />
                  <Bar dataKey="Renta" stackId="costs" fill="hsl(var(--chart-1))" />
                  <Bar dataKey="Nómina" stackId="costs" fill="hsl(var(--chart-3))" />
                  <Bar dataKey="Software" stackId="costs" fill="hsl(142 71% 45%)" />
                  <Bar dataKey="Depr. Contable" stackId="costs" fill="hsl(280 65% 60%)" />
                  <Bar dataKey="Depr. Equipos" stackId="costs" fill="hsl(320 65% 50%)" />
                  <Bar dataKey="Otros" stackId="costs" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Net Profit Line Chart */}
      {!isComparison && filteredData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utilidad Neta Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netProfitChartData}>
                  <defs>
                    <linearGradient id="netProfitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="Utilidad Neta"
                    stroke="hsl(var(--chart-2))"
                    fill="url(#netProfitGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Table (Year vs Year) */}
      {isComparison && comparisonRows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concepto</TableHead>
                  {yearTotals.map((yt) => (
                    <TableHead key={yt.year} className="text-right min-w-[120px]">{yt.year}</TableHead>
                  ))}
                  <TableHead className="text-right min-w-[120px] font-bold">Var. $</TableHead>
                  <TableHead className="text-right min-w-[100px] font-bold">Var. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonRows.map((row) => (
                  <TableRow key={row.label} className={row.isSubtotal ? "bg-muted/40 border-t border-border" : ""}>
                    <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
                      {row.label}
                    </TableCell>
                    {row.yearValues.map((val, i) => (
                      <TableCell key={i} className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}>
                        {formatCell(row, val)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-mono font-bold ${row.delta >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {row.isPercent ? `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)} pp` : `${row.delta >= 0 ? "+" : ""}${formatCurrency(row.delta)}`}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${row.deltaPct !== null && row.deltaPct >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {row.deltaPct !== null ? `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Standard Statement Table */}
      {!isComparison && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concepto</TableHead>
                  {filteredData.map((d) => (
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
      )}
    </>
  );
}
