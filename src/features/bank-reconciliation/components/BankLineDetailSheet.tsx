import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { ManualMatchPicker } from "./ManualMatchPicker";
import {
  useConfirmBankMatch,
  useIgnoreBankLine,
  useUnmatchBankLine,
} from "../hooks/useBankReconciliationMutations";
import { BANK_LINE_STATUS_LABELS } from "../lib/bankReconciliationConstants";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  line: BankStatementLine | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function matchTarget(isCharge: boolean, id: string | undefined) {
  return {
    paymentId: isCharge ? undefined : id,
    supplierPaymentId: isCharge ? id : undefined,
  };
}

export function BankLineDetailSheet({ line, open, onOpenChange }: Props) {
  const [ignoreReason, setIgnoreReason] = useState("");
  const confirmMut = useConfirmBankMatch();
  const ignoreMut = useIgnoreBankLine();
  const unmatchMut = useUnmatchBankLine();

  if (!line) return null;
  const isCharge = line.signed_amount < 0;
  const suggestedId = isCharge ? line.suggested_supplier_payment_id : line.suggested_payment_id;

  const handleConfirmSuggested = () => {
    if (!suggestedId) return;
    confirmMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, ...matchTarget(isCharge, suggestedId) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleManualMatch = (pid: string) => {
    confirmMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, ...matchTarget(isCharge, pid) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleIgnore = () => {
    if (!ignoreReason.trim()) return;
    ignoreMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, reason: ignoreReason.trim() },
      { onSuccess: () => { setIgnoreReason(""); onOpenChange(false); } },
    );
  };

  const handleUnmatch = () => {
    unmatchMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isCharge ? "Cargo" : "Abono"} · {formatDateDisplay(line.posted_date)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Importe</span><span className="font-mono font-bold">{formatCurrency(line.signed_amount)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Estado</span><span>{BANK_LINE_STATUS_LABELS[line.status]}</span></div>
            <div className="text-xs text-muted-foreground">Descripción</div>
            <p className="text-sm">{line.description || "—"}</p>
            {line.reference && <p className="text-xs">Ref: <span className="font-mono">{line.reference}</span></p>}
          </div>

          {line.status === "suggested" && suggestedId && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-sm font-medium mb-2">Pago sugerido</p>
              <p className="text-xs text-muted-foreground mb-2">Score: {line.match_score ?? "—"}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleConfirmSuggested} disabled={confirmMut.isPending}>Confirmar emparejamiento</Button>
              </div>
            </div>
          )}

          {(line.status === "matched" || line.status === "ignored") && (
            <Button variant="outline" size="sm" onClick={handleUnmatch} disabled={unmatchMut.isPending}>
              Deshacer
            </Button>
          )}

          {(line.status === "unmatched" || line.status === "suggested") && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Emparejar manualmente</p>
                <ManualMatchPicker kind={isCharge ? "supplier_payment" : "payment"} onSelect={handleManualMatch} />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Marcar como ignorado (comisión bancaria, gasto no registrado, etc.)</Label>
                <Textarea value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} placeholder="Razón..." rows={2} />
                <Button variant="ghost" size="sm" onClick={handleIgnore} disabled={!ignoreReason.trim() || ignoreMut.isPending}>
                  Ignorar
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
