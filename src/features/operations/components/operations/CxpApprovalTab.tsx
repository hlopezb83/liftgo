import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import {
  useCxpApprovalThreshold,
  useUpdateCxpApprovalThreshold,
} from "@/features/company-settings/hooks/useCxpApprovalThreshold";

export function CxpApprovalTab() {
  const { data, isLoading } = useCxpApprovalThreshold();
  const update = useUpdateCxpApprovalThreshold();
  const [value, setValue] = useState<string>("");

  if (isLoading || !data) return <Skeleton className="h-40" />;

  const current = data.threshold;
  const parsed = Number(value);
  const isValid = value !== "" && Number.isFinite(parsed) && parsed >= 0;
  const isDirty = isValid && parsed !== current;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Aprobación de Cuentas por Pagar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Las facturas de proveedor cuyo total en MXN supere este umbral quedarán
          marcadas como <strong>Por aprobar</strong> y no podrán pagarse hasta que un
          administrador las apruebe. El cambio aplica solo a facturas nuevas; las
          existentes conservan su estado.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="threshold">Umbral (MXN)</Label>
          <Input
            id="threshold"
            type="number"
            min={0}
            step="100"
            placeholder={current.toString()}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Umbral actual: <strong className="font-mono">{formatCurrency(current)}</strong>
          </p>
        </div>

        <Button
          disabled={!isDirty || update.isPending}
          onClick={() => update.mutate(
            { id: data.id, threshold: parsed },
            { onSuccess: () => setValue("") },
          )}
        >
          {update.isPending ? "Guardando…" : "Guardar umbral"}
        </Button>
      </CardContent>
    </Card>
  );
}
