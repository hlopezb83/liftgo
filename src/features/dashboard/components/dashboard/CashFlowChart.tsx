import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";

interface CashFlowItem {
  month: string;
  invoiced: number;
  paid: number;
}

interface CashFlowChartProps {
  data: CashFlowItem[];
}

interface TooltipPayloadEntry {
  payload: CashFlowItem;
}

function CashFlowTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const net = item.invoiced - item.paid;
  const isPositive = net >= 0;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md text-xs space-y-1.5 min-w-[180px]">
      <p className="font-semibold text-sm mb-1">{item.month}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Facturado:</span>
        <span className="font-mono">{formatCurrency(item.invoiced)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Pagado:</span>
        <span className="font-mono">{formatCurrency(item.paid)}</span>
      </div>
      <div className="border-t pt-1.5 mt-1.5 flex justify-between gap-4">
        <span className="font-medium">Neto:</span>
        <span className={`font-mono font-semibold ${isPositive ? "text-status-available" : "text-destructive"}`}>
          {formatCurrency(net)}
        </span>
      </div>
      <p className={`text-[11px] text-right ${isPositive ? "text-status-available" : "text-destructive"}`}>
        {isPositive ? "Flujo positivo" : "Flujo negativo"}
      </p>
    </div>
  );
}

export const CashFlowChart = memo(function CashFlowChart({ data }: CashFlowChartProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Flujo de Efectivo</CardTitle></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip content={<CashFlowTooltip />} />
              <Bar dataKey="invoiced" name="Facturado" fill="hsl(var(--status-rented))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="paid" name="Pagado" fill="hsl(var(--status-available))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Sin datos de facturación aún</p>
        )}
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-status-rented" />Facturado</div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-status-available" />Pagado</div>
        </div>
      </CardContent>
    </Card>
  );
});
