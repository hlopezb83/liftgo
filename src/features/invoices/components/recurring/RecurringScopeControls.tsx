import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { useRecurringPreviewModel } from "./useRecurringPreviewModel";
import type { RecurringPreviewScope } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

type Model = ReturnType<typeof useRecurringPreviewModel>;
interface Props {
  model: Model;
  isGenerating: boolean;
  isLoading: boolean;
  isError: boolean;
  onScopeChange?: (scope: RecurringPreviewScope) => void;
}

export function RecurringScopeControls({ model, isGenerating, isLoading, isError, onScopeChange }: Props) {
  const { minMonth, maxMonth, includeFuturePeriods, futureThroughMonth, scope, validMonth, changeScope } = model;
  return (
<div className="mb-4 space-y-3">
        <label htmlFor="recurring-future-opt-in" className="flex items-center gap-2 text-sm font-medium">
          <Checkbox id="recurring-future-opt-in" checked={includeFuturePeriods} disabled={isGenerating}
            onCheckedChange={(checked) => changeScope(checked === true, futureThroughMonth)} />
          Incluir períodos futuros
        </label>
        {includeFuturePeriods && (
          <div className="space-y-1">
            <label htmlFor="recurring-through-month" className="text-sm">Hasta el mes</label>
            <Input id="recurring-through-month" type="month" min={minMonth} max={maxMonth}
              value={futureThroughMonth} disabled={isGenerating}
              onChange={(event) => changeScope(true, event.target.value)} />
            <p className="text-xs text-muted-foreground">Adelanta períodos consecutivos desde el primer pendiente de cada reserva. Cambiar el alcance borra la selección.</p>
            {!validMonth && <p role="alert" className="text-sm text-destructive">Elige un mes entre {minMonth} y {maxMonth}.</p>}
          </div>
        )}
        {onScopeChange && !isError && (
          <Button variant="outline" size="sm" disabled={isGenerating || isLoading || (includeFuturePeriods && !validMonth)}
            onClick={() => onScopeChange(scope)}>Volver a calcular</Button>
        )}
      </div>
  );
}
