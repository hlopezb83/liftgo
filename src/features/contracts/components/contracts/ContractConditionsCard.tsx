import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ContractData } from "./ContractPDFButton";

/**
 * Renderiza el bloque opcional "Condiciones de Uso" del detalle de contrato.
 * Aislado del componente página para reducir su complejidad ciclomática.
 */
export function ContractConditionsCard({ contract }: { contract: ContractData }) {
  // v7.302.2: comparar contra null/undefined — un `0` capturado es un dato
  // válido y antes desaparecía junto con su etiqueta.
  const has = (v: unknown) => v !== null && v !== undefined && v !== "";
  const visible =
    has(contract.usage_location) || has(contract.max_hours_per_month) || has(contract.payment_frequency);
  if (!visible) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Condiciones de Uso</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {contract.usage_location && (
            <div className="col-span-2 sm:col-span-3">
              <span className="text-muted-foreground block">Ubicación de Uso</span>
              {contract.usage_location}
            </div>
          )}
          {has(contract.max_hours_per_month) && (
            <div><span className="text-muted-foreground block">Horas Máx/Mes</span>{contract.max_hours_per_month}</div>
          )}
          {has(contract.extra_hour_rate) && (
            <div><span className="text-muted-foreground block">Tarifa Hora Extra</span>{formatCurrency(Number(contract.extra_hour_rate))}</div>
          )}
          {contract.payment_frequency && (
            <div><span className="text-muted-foreground block">Frecuencia de Pago</span>{contract.payment_frequency}</div>
          )}
          {has(contract.late_interest_rate) && (
            <div><span className="text-muted-foreground block">Interés Moratorio</span>{contract.late_interest_rate}%</div>
          )}
          {contract.witness_1 && (
            <div><span className="text-muted-foreground block">Testigo 1</span>{contract.witness_1}</div>
          )}
          {contract.witness_2 && (
            <div><span className="text-muted-foreground block">Testigo 2</span>{contract.witness_2}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
