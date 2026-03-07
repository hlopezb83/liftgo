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

export function CashFlowChart({ data }: CashFlowChartProps) {
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
              <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Bar dataKey="invoiced" name="Facturado" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="paid" name="Pagado" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Sin datos de facturación aún</p>
        )}
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(217, 91%, 60%)" }} />Facturado</div>
          <div className="flex items-center gap-1.5 text-xs"><div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(142, 71%, 45%)" }} />Pagado</div>
        </div>
      </CardContent>
    </Card>
  );
}
