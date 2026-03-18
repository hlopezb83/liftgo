import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock } from "lucide-react";
import { formatDateDisplay } from "@/lib/utils";
import type { ForkliftFinancials } from "@/hooks/useForkliftFinancials";

interface ForkliftHourometerHistoryProps {
  history: ForkliftFinancials["hourometer_history"];
}

export function ForkliftHourometerHistory({ history }: ForkliftHourometerHistoryProps) {
  if (!history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Historial de Horómetro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Lectura (hrs)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((entry) => (
              <TableRow key={entry.delivery_id}>
                <TableCell className="text-sm">{formatDateDisplay(entry.date)}</TableCell>
                <TableCell className="text-sm font-mono">{entry.delivery_number}</TableCell>
                <TableCell className="text-sm">
                  {entry.type === "delivery" ? "Entrega" : "Recolección"}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">{entry.hours_reading}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
