import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { parseDateLocal, formatDateDisplay } from "@/lib/utils";
import { formatCurrency } from "@/lib/format/formatCurrency";

type Props = {
  startDate: string;
  endDate: string;
  depositAmount: number | string | null;
  dailyRate: number | string | null;
  weeklyRate: number | string | null;
  monthlyRate: number | string | null;
  signedAt: string | null;
  signedBy: string | null;
};

const num = (v: number | string | null) => Number(v ?? 0);

export function ContractDetailsCard({
  startDate,
  endDate,
  depositAmount,
  dailyRate,
  weeklyRate,
  monthlyRate,
  signedAt,
  signedBy,
}: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Detalles del Contrato</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><span className="text-muted-foreground block">Inicio</span>{formatDateDisplay(startDate)}</div>
          <div><span className="text-muted-foreground block">Fin</span>{formatDateDisplay(endDate)}</div>
          <div><span className="text-muted-foreground block">Depósito</span>{formatCurrency(num(depositAmount))}</div>
          <div><span className="text-muted-foreground block">Tarifa Diaria</span>{formatCurrency(num(dailyRate))}</div>
          <div><span className="text-muted-foreground block">Tarifa Semanal</span>{formatCurrency(num(weeklyRate))}</div>
          <div><span className="text-muted-foreground block">Tarifa Mensual</span>{formatCurrency(num(monthlyRate))}</div>
          {signedAt && <div><span className="text-muted-foreground block">Firmado</span>{format(parseDateLocal(signedAt), "dd/MM/yyyy")}</div>}
          {signedBy && <div><span className="text-muted-foreground block">Firmado por</span>{signedBy}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ContractTextCard({ title, content }: { title: string; content: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm whitespace-pre-wrap">{content}</p></CardContent>
    </Card>
  );
}
