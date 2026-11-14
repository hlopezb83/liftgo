import { useEffect, useState } from "react";
import { SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/features/users";
import { useCashFlowSettings, useUpdateCashFlowSettings } from "../hooks/useCashFlowSettings";

interface Props {
  weeks: number;
  onChangeWeeks: (n: number) => void;
}

function amountError(value: string): string | undefined {
  if (!value.trim()) return "Captura un importe; puedes escribir 0";
  if (!Number.isFinite(Number(value))) return "Captura un importe válido";
  if (Number(value) < 0) return "El importe no puede ser negativo";
}

function CashFlowAmountInput({ id, label, value, disabled, onChange }: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const error = disabled ? undefined : amountError(value);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        inputMode="decimal"
        className="w-40 h-9"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={`${id}-error`} className="max-w-40 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CashFlowSettingsBar({ weeks, onChangeWeeks }: Props) {
  const { data: settings, isLoading } = useCashFlowSettings();
  const { data: role } = useUserRole();
  const canEdit = role === "admin" || role === "administrativo";
  const update = useUpdateCashFlowSettings();

  const [initial, setInitial] = useState("");
  const [buffer, setBuffer] = useState("");

  useEffect(() => {
    if (!settings) return;
    // Sincronización de campos controlados con datos remotos (react-query).
    // El prev-prop guard equivalente supera el umbral de complejidad del proyecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitial(String(settings.initialBalance));
    setBuffer(String(settings.safetyBuffer));
  }, [settings]);

  const initialNum = Number(initial);
  const bufferNum = Number(buffer);
  const validAmounts = !amountError(initial) && !amountError(buffer);
  const dirty =
    settings != null &&
    (Number.isFinite(initialNum) && initialNum !== settings.initialBalance ||
      Number.isFinite(bufferNum) && bufferNum !== settings.safetyBuffer);

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border rounded-md bg-muted/30">
      <CashFlowAmountInput id="cf-initial" label="Saldo inicial (MXN)" value={initial} disabled={isLoading || !canEdit} onChange={setInitial} />
      <CashFlowAmountInput id="cf-buffer" label="Colchón mínimo (MXN)" value={buffer} disabled={isLoading || !canEdit} onChange={setBuffer} />
      <div className="space-y-1">
        <Label className="text-xs">Horizonte</Label>
        <Select value={String(weeks)} onValueChange={(v) => onChangeWeeks(Number(v))}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="4">4 semanas</SelectItem>
            <SelectItem value="8">8 semanas</SelectItem>
            <SelectItem value="12">12 semanas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {canEdit && (
        <Button
          size="sm"
          disabled={!dirty || !validAmounts || update.isPending || !settings?.id}
          onClick={() => {
            if (!settings?.id || !validAmounts) return;
            update.mutate({
              id: settings.id,
              initialBalance: initialNum,
              safetyBuffer: bufferNum,
            });
          }}
        >
          <SaveIcon className="h-4 w-4 mr-1" /> Guardar
        </Button>
      )}
    </div>
  );
}
