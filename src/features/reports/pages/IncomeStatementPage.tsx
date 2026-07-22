import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { nowMty } from "@/lib/utils";
import { IncomeStatementReport } from "../components/reports/IncomeStatementReport";

function generateMonthOptions(count: number) {
  const now = nowMty();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = subMonths(now, i);
    const value = format(d, "yyyy-MM");
    const label = formatMonthLongEs(d);
    options.push({ value, label });
  }
  return options;
}

export default function IncomeStatementPage() {
  const monthOptions = generateMonthOptions(24);

  const [startMonth, setStartMonth] = useState(() => format(subMonths(nowMty(), 3), "yyyy-MM"));
  const [endMonth, setEndMonth] = useState(() => format(nowMty(), "yyyy-MM"));
  const [accountingBasis, setAccountingBasis] = useState<"accrual" | "cash">("accrual");

  const [sy, sm] = startMonth.split("-").map(Number);
  const startDate = startOfMonth(new Date(sy, sm - 1, 1));
  const [ey, em] = endMonth.split("-").map(Number);
  const endDate = endOfMonth(new Date(ey, em - 1, 1));

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          title="Estado de Resultados"
          subtitle="Análisis financiero detallado con depreciación de equipos"
          actions={
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
              <Label
                htmlFor="accounting-basis"
                className={accountingBasis === "accrual" ? "text-xs font-semibold text-foreground" : "text-xs text-muted-foreground"}
              >
                Devengado
              </Label>
              <Switch
                id="accounting-basis"
                checked={accountingBasis === "cash"}
                onCheckedChange={(checked) => setAccountingBasis(checked ? "cash" : "accrual")}
              />
              <Label
                htmlFor="accounting-basis"
                className={accountingBasis === "cash" ? "text-xs font-semibold text-foreground" : "text-xs text-muted-foreground"}
              >
                Flujo de efectivo
              </Label>
            </div>
          }
        />

        <Card>
          <CardContent className="pt-6">
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

        <p className="text-xs text-muted-foreground px-1">
          Nota: <strong>(-) Mantenimiento</strong> proviene de los registros de mantenimiento.
          Si además captura una factura de proveedor con categoría "Mantenimiento" o "Refacciones"
          para el mismo trabajo, ambos importes se restarán por separado. Use un solo canal por evento
          para evitar duplicar el gasto.
        </p>
      </PageContainer>
    </PageTransition>
  );
}
