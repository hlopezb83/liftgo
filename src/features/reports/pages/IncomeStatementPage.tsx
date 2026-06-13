import { useState, useMemo } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IncomeStatementReport } from "../components/reports/IncomeStatementReport";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { nowMty } from "@/lib/utils";

function generateMonthOptions(count: number) {
  const now = nowMty();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = subMonths(now, i);
    const value = format(d, "yyyy-MM");
    const label = format(d, "MMMM yyyy", { locale: es });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

export default function IncomeStatementPage() {
  const monthOptions = useMemo(() => generateMonthOptions(24), []);

  const [startMonth, setStartMonth] = useState(() => format(subMonths(nowMty(), 3), "yyyy-MM"));
  const [endMonth, setEndMonth] = useState(() => format(nowMty(), "yyyy-MM"));
  const [accountingBasis, setAccountingBasis] = useState<"accrual" | "cash">("accrual");

  const [sy, sm] = startMonth.split("-").map(Number);
  const startDate = startOfMonth(new Date(sy, sm - 1, 1));
  const [ey, em] = endMonth.split("-").map(Number);
  const endDate = endOfMonth(new Date(ey, em - 1, 1));

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Estado de Resultados" subtitle="Análisis financiero detallado con depreciación de equipos" />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Label htmlFor="accounting-basis" className={accountingBasis === "accrual" ? "font-semibold text-foreground" : "text-muted-foreground"}>Devengado</Label>
              <Switch
                id="accounting-basis"
                checked={accountingBasis === "cash"}
                onCheckedChange={(checked) => setAccountingBasis(checked ? "cash" : "accrual")}
              />
              <Label htmlFor="accounting-basis-cash" className={accountingBasis === "cash" ? "font-semibold text-foreground" : "text-muted-foreground"}>Flujo de efectivo</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Desde</Label>
                <Select value={startMonth} onValueChange={setStartMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hasta</Label>
                <Select value={endMonth} onValueChange={setEndMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <IncomeStatementReport
          startDate={startDate}
          endDate={endDate}
          accountingBasis={accountingBasis}
        />
      </div>
    </PageTransition>
  );
}
