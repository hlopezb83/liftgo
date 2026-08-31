import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMaintenanceBuffer,
  useUpdateMaintenanceBuffer,
} from "@/features/company-settings";

/**
 * A6R2-7: expone el buffer de días alrededor del próximo servicio, que las
 * RPC de reservas leen desde `company_settings`.
 */
export function MaintenanceBufferCard() {
  const { data, isLoading, isError, refetch } = useMaintenanceBuffer();
  const update = useUpdateMaintenanceBuffer();
  const [value, setValue] = useState<string>("");

  if (isError) {
    return (
      <QueryErrorState
        bare
        entity="el buffer de mantenimiento"
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isLoading || !data) return <Skeleton className="h-40" />;

  const current = data.days;
  const parsed = Number(value);
  const isValid =
    value !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 30;
  const isDirty = isValid && parsed !== current;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Buffer de Mantenimiento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Días de margen alrededor del próximo servicio programado. Una unidad no
          se puede reservar ni extender si la ventana solicitada cae dentro de ese
          margen, y tampoco aparece en la búsqueda de equipos disponibles.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="maintenance-buffer">Días de buffer (0 a 30)</Label>
          <Input
            id="maintenance-buffer"
            type="number"
            min={0}
            max={30}
            step="1"
            placeholder={current.toString()}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Valor actual: <strong className="font-mono">{current}</strong> día(s)
          </p>
        </div>

        <Button
          disabled={!isDirty || update.isPending}
          onClick={() =>
            update.mutate(
              { id: data.id, days: parsed },
              { onSuccess: () => setValue("") },
            )
          }
        >
          {update.isPending ? "Guardando…" : "Guardar buffer"}
        </Button>
      </CardContent>
    </Card>
  );
}
