import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import { useContractDepositDraft } from "../../hooks/useContractDepositDraft";
import type { ContractDepositSnapshot, DepositStatus } from "../../lib/contractDepositRpc";

const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  held: "Retenido",
  applied: "Aplicado",
  returned: "Devuelto",
};

type Props = ContractDepositSnapshot & {
  contractId: string;
  onReload: () => Promise<ContractDepositSnapshot>;
};

function DepositAmountField({ status, amount, defaultAmount, value, valid, disabled, onChange }: {
  status: DepositStatus; amount: number; defaultAmount: number; value: string;
  valid: boolean; disabled: boolean; onChange: (value: string) => void;
}) {
  const labels: Record<DepositStatus, string> = {
    held: "Importe del depósito (MXN)", applied: "Importe aplicado (MXN)", returned: "Importe devuelto (MXN)",
  };
  return <div className="space-y-1">
    <Label htmlFor="deposit-amount">{labels[status]}</Label>
    <Input id="deposit-amount" type="number" inputMode="decimal" min={0} max={amount}
      value={value} placeholder={String(defaultAmount)} onChange={(e) => onChange(e.target.value)}
      disabled={disabled || status === "held"} aria-invalid={!valid} aria-describedby={status === "held" ? undefined : "deposit-amount-help"} />
    {status !== "held" && <p id="deposit-amount-help" className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"} role={valid ? undefined : "alert"}>
      {valid ? `Si lo dejas vacío, se registrarán ${formatCurrency(defaultAmount)}.` : `Ingresa un importe entre ${formatCurrency(0)} y ${formatCurrency(amount)}.`}
    </p>}
  </div>;
}

/**
 * A6R2-4: ciclo de vida del depósito en garantía. Sólo presenta y dispara la
 * RPC `set_contract_deposit_status_checked`; las reglas viven en la
 * base de datos.
 */
export function ContractDepositCard(props: Props) {
  const { depositAmount, depositStatus, depositSettledAt, depositSettledAmount, depositNotes } = props;
  const draft = useContractDepositDraft(props);
  const { status, settledAmount, notes, setStatus, setSettledAmount, setNotes, formState, busy,
    reloadError, isReloading, reloadDeposit, handleSave } = draft;
  const amount = Number(depositAmount ?? 0);
  const current = (depositStatus ?? "held") as DepositStatus;
  const summaryColumns = ["sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"][Number(!!depositSettledAt) + Number(depositSettledAmount != null)];
  if (!draft.visible) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Depósito en garantía</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className={cn("grid grid-cols-2 gap-4", summaryColumns)}>
          <div><span className="text-muted-foreground block">Monto</span>{formatCurrency(amount)}</div>
          <div><span className="text-muted-foreground block">Estado</span>{DEPOSIT_STATUS_LABELS[current]}</div>
          {depositSettledAt && (
            <div><span className="text-muted-foreground block">Fecha</span>{formatDateMty(depositSettledAt)}</div>
          )}
          {depositSettledAmount !== null && depositSettledAmount !== undefined && (
            <div>
              <span className="text-muted-foreground block">{current === "returned" ? "Importe devuelto" : "Importe aplicado"}</span>
              {formatCurrency(Number(depositSettledAmount))}
            </div>
          )}
        </div>
        {depositNotes && <p className="text-muted-foreground whitespace-pre-wrap">{depositNotes}</p>}

        <RoleGuard module="Contratos" minAccess="full" fallback={null}>
          {draft.needsReload && <div className="space-y-2" role="alert">
            <p>{reloadError ? "No se pudo recargar el depósito. Tus cambios siguen aquí." :
              "El contrato cambió. Recarga el depósito para revisar los datos actuales; se reemplazarán tus cambios sin guardar."}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void reloadDeposit()}>
              {isReloading ? "Recargando…" : "Recargar depósito"}
            </Button>
          </div>}
          <div className="grid gap-3 sm:grid-cols-3 items-end border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="deposit-status">Nuevo estado</Label>
              <Select value={status} disabled={busy} onValueChange={(v) => setStatus(v as DepositStatus)}>
                <SelectTrigger id="deposit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="held">Retenido</SelectItem>
                  <SelectItem value="applied">Aplicado a cargos</SelectItem>
                  <SelectItem value="returned">Devuelto al cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DepositAmountField status={status} amount={formState.amount} defaultAmount={formState.defaultAmount}
              value={settledAmount} valid={formState.amountValid} disabled={busy} onChange={setSettledAmount} />
            <div className="space-y-1">
              <Label htmlFor="deposit-notes">Notas</Label>
              <Textarea
                id="deposit-notes"
                rows={1}
                value={notes}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <Button size="sm" onClick={handleSave} disabled={draft.saveDisabled}>
                {draft.isPending ? "Guardando…" : "Guardar estado del depósito"}
              </Button>
            </div>
          </div>
        </RoleGuard>
      </CardContent>
    </Card>
  );
}
