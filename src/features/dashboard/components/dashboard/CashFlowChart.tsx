import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ReportChartCard } from "@/components/domain/ReportChartCard";
import { ExpenseIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";

function formatCompactMxn(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

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

export function CashFlowChart({ data }: CashFlowChartProps) {
  return (
    <ReportChartCard
      title="Flujo de Efectivo"
      icon={ExpenseIcon}
      iconColor="text-status-rented"
      iconBg="bg-status-rented/10"
      footer={
        <div className="flex justify-center gap-6">
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-status-rented" />Facturado</div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-status-available" />Pagado</div>
        </div>
      }
    >
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barGap={4} margin={{ top: 5, right: 12, left: 12, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCompactMxn(Number(v))} width={64} />
            <Tooltip content={<CashFlowTooltip />} />
            <Bar dataKey="invoiced" name="Facturado" fill="hsl(var(--status-rented))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" name="Pagado" fill="hsl(var(--status-available))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-10">Sin datos de facturación aún</p>
      )}
    </ReportChartCard>
  );
}
