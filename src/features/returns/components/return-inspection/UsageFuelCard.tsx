import { InfoRow } from "@/components/forms/InfoRow";
import { Fuel } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUEL_LEVEL_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function UsageFuelCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fuel className="h-4 w-4 text-muted-foreground" />Uso y Combustible
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Horas de uso" value={ins.hours_used != null ? `${ins.hours_used} hrs` : "—"} />
        <InfoRow
          label="Nivel de combustible"
          value={ins.fuel_level ? (FUEL_LEVEL_LABELS[ins.fuel_level] || ins.fuel_level) : "—"}
        />
        {/* Fix 8.5: el exceso de horas del contrato se hace visible aquí para
            que el cobro no se pierda. NO se factura automáticamente. */}
        {Number(ins.extra_hours ?? 0) > 0 && (
          <Alert>
            <AlertDescription>
              Exceso de {ins.extra_hours} horas → cargo sugerido{" "}
              {formatCurrency(Number(ins.suggested_extra_hour_charge ?? 0))} (facturación manual)
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
