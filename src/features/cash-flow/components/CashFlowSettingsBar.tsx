import { useId } from "react";
import { SaveIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/features/users";
import { useCashFlowDraft } from "../hooks/useCashFlowDraft";
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
  const horizonId = useId();
  const amountsDisabled = isLoading || !canEdit || update.isPending;

  const { initial, buffer, setInitial, setBuffer, dirty, remoteChanged, markSaved } = useCashFlowDraft(settings);

  const initialNum = Number(initial);
  const bufferNum = Number(buffer);
  const validAmounts = !amountError(initial) && !amountError(buffer);

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border rounded-md bg-muted/30">
      <CashFlowAmountInput id="cf-initial" label="Saldo inicial (MXN)" value={initial} disabled={amountsDisabled} onChange={setInitial} />
      <CashFlowAmountInput id="cf-buffer" label="Colchón mínimo (MXN)" value={buffer} disabled={amountsDisabled} onChange={setBuffer} />
      <div className="space-y-1">
        <Label htmlFor={horizonId} className="text-xs">Horizonte</Label>
        <Select value={String(weeks)} onValueChange={(v) => onChangeWeeks(Number(v))}>
          <SelectTrigger id={horizonId} className="w-32 h-9"><SelectValue /></SelectTrigger>
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
          aria-busy={update.isPending}
          onClick={() => {
            if (!settings?.id || !validAmounts) return;
            const saved = {
              id: settings.id,
              initialBalance: initialNum,
              safetyBuffer: bufferNum,
            };
            update.mutate(saved, { onSuccess: () => markSaved(saved) });
          }}
        >
          {update.isPending
            ? <><SpinnerIcon className="mr-1 h-4 w-4 animate-spin" /> Guardando…</>
            : <><SaveIcon className="mr-1 h-4 w-4" /> Guardar</>}
        </Button>
      )}
      <span aria-live="polite" className="sr-only">{update.isPending && "Guardando la configuración de flujo de caja…"}</span>
      {remoteChanged && <p role="status" className="w-full text-sm text-muted-foreground">
        Los saldos se actualizaron mientras capturabas. Conservamos tus cambios; al guardar se aplicarán los importes que ves aquí.
      </p>}
    </div>
  );
}
