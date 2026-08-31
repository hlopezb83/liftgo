import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useSetContractDepositStatus, type DepositStatus } from "../../hooks/useContracts";

const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  held: "Retenido",
  applied: "Aplicado",
  returned: "Devuelto",
};

type Props = {
  contractId: string;
  depositAmount: number | string | null;
  depositStatus: string | null;
  depositSettledAt: string | null;
  depositSettledAmount: number | string | null;
  depositNotes: string | null;
};

/**
 * A6R2-4: ciclo de vida del depósito en garantía. Sólo presenta y dispara la
 * RPC `set_contract_deposit_status`; las reglas (rol, monto máximo) viven en la
 * base de datos.
 */
export function ContractDepositCard({
  contractId,
  depositAmount,
  depositStatus,
  depositSettledAt,
  depositSettledAmount,
  depositNotes,
}: Props) {
  const amount = Number(depositAmount ?? 0);
  const current = (depositStatus ?? "held") as DepositStatus;
  const [status, setStatus] = useState<DepositStatus>(current);
  const [settledAmount, setSettledAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>(depositNotes ?? "");
  const mutation = useSetContractDepositStatus();

  if (amount <= 0) return null;

  const handleSave = () => {
    mutation.mutate({
      contractId,
      status,
      amount: settledAmount === "" ? null : Number(settledAmount),
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Depósito en Garantía</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><span className="text-muted-foreground block">Monto</span>{formatCurrency(amount)}</div>
          <div><span className="text-muted-foreground block">Estado</span>{DEPOSIT_STATUS_LABELS[current]}</div>
          {depositSettledAt && (
            <div><span className="text-muted-foreground block">Fecha</span>{formatDateDisplay(depositSettledAt)}</div>
          )}
          {depositSettledAmount !== null && depositSettledAmount !== undefined && (
            <div>
              <span className="text-muted-foreground block">Monto liquidado</span>
              {formatCurrency(Number(depositSettledAmount))}
            </div>
          )}
        </div>
        {depositNotes && <p className="text-muted-foreground whitespace-pre-wrap">{depositNotes}</p>}

        <RoleGuard module="Contratos" minAccess="full" fallback={null}>
          <div className="grid gap-3 sm:grid-cols-3 items-end border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="deposit-status">Nuevo estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DepositStatus)}>
                <SelectTrigger id="deposit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="held">Retenido</SelectItem>
                  <SelectItem value="applied">Aplicado a cargos</SelectItem>
                  <SelectItem value="returned">Devuelto al cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="deposit-amount">Monto (opcional)</Label>
              <Input
                id="deposit-amount"
                type="number"
                inputMode="decimal"
                min={0}
                max={amount}
                value={settledAmount}
                placeholder={String(amount)}
                onChange={(e) => setSettledAmount(e.target.value)}
                disabled={status === "held"}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="deposit-notes">Notas</Label>
              <Textarea
                id="deposit-notes"
                rows={1}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? "Guardando…" : "Guardar depósito"}
              </Button>
            </div>
          </div>
        </RoleGuard>
      </CardContent>
    </Card>
  );
}
