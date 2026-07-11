import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveIcon } from "@/components/icons";
import { useUserRole } from "@/features/users";
import { useCashFlowSettings, useUpdateCashFlowSettings } from "../hooks/useCashFlowSettings";

interface Props {
  weeks: number;
  onChangeWeeks: (n: number) => void;
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
    setInitial(String(settings.initialBalance));
    setBuffer(String(settings.safetyBuffer));
  }, [settings]);

  const initialNum = Number(initial);
  const bufferNum = Number(buffer);
  const dirty =
    settings != null &&
    (Number.isFinite(initialNum) && initialNum !== settings.initialBalance ||
      Number.isFinite(bufferNum) && bufferNum !== settings.safetyBuffer);

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border rounded-md bg-muted/30">
      <div className="space-y-1">
        <Label htmlFor="cf-initial" className="text-xs">Saldo inicial (MXN)</Label>
        <Input
          id="cf-initial"
          type="number"
          inputMode="decimal"
          className="w-40 h-9"
          value={initial}
          disabled={isLoading || !canEdit}
          onChange={(e) => setInitial(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cf-buffer" className="text-xs">Colchón mínimo (MXN)</Label>
        <Input
          id="cf-buffer"
          type="number"
          inputMode="decimal"
          className="w-40 h-9"
          value={buffer}
          disabled={isLoading || !canEdit}
          onChange={(e) => setBuffer(e.target.value)}
        />
      </div>
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
          disabled={!dirty || update.isPending || !settings?.id}
          onClick={() =>
            settings &&
            update.mutate({
              id: settings.id,
              initialBalance: Number.isFinite(initialNum) ? initialNum : 0,
              safetyBuffer: Number.isFinite(bufferNum) ? bufferNum : 0,
            })
          }
        >
          <SaveIcon className="h-4 w-4 mr-1" /> Guardar
        </Button>
      )}
    </div>
  );
}
