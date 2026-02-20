import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/formatCurrency";

interface InvoiceGroup {
  status: string;
  count: number;
  total: number;
  color: string;
}

interface InvoiceBreakdownProps {
  data: InvoiceGroup[];
  outstandingRevenue: number;
}

export function InvoiceBreakdown({ data, outstandingRevenue }: InvoiceBreakdownProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Desglose de Facturas</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate("/invoices")}>Ver Todas</Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-3">
            {data.map((group) => (
              <div key={group.status} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
                  <div>
                    <p className="font-medium text-sm capitalize">{group.status}</p>
                    <p className="text-xs text-muted-foreground">{group.count} factura{group.count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <p className="font-mono font-semibold text-sm">{formatCurrency(group.total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-sm font-medium">Total Pendiente</p>
              <p className="font-mono font-bold">{formatCurrency(outstandingRevenue)}</p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Sin facturas aún</p>
        )}
      </CardContent>
    </Card>
  );
}
