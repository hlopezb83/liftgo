import { Activity } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { BankLineActions } from "./BankLineActions";
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
  const confirmMut = useConfirmBankMatch();
  const ignoreMut = useIgnoreBankLine();
  const unmatchMut = useUnmatchBankLine();

  if (!line) return null;
  const isCharge = line.signed_amount < 0;
  const suggestedId = isCharge ? line.suggested_supplier_payment_id : line.suggested_payment_id;

  const close = () => onOpenChange(false);

  const handleConfirmSuggested = () => {
    if (!suggestedId) return;
    confirmMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, ...matchTarget(isCharge, suggestedId) },
      { onSuccess: close },
    );
  };

  const handleManualMatch = (pid: string) => {
    confirmMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, ...matchTarget(isCharge, pid) },
      { onSuccess: close },
    );
  };

  const handleIgnore = (reason: string) => {
    ignoreMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, reason },
      { onSuccess: close },
    );
  };

  const handleUnmatch = () => {
    unmatchMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id },
      { onSuccess: close },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isCharge ? "Cargo" : "Abono"} · {formatDateDisplay(line.posted_date)}</SheetTitle>
        </SheetHeader>
        <Activity mode={open ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Importe</span><span className="font-mono font-bold">{formatCurrency(line.signed_amount)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Estado</span><span>{BANK_LINE_STATUS_LABELS[line.status]}</span></div>
            <div className="text-xs text-muted-foreground">Descripción</div>
            <p className="text-sm">{line.description || "—"}</p>
            {line.reference && <p className="text-xs">Ref: <span className="font-mono">{line.reference}</span></p>}
          </div>

          <BankLineActions
            line={line}
            isCharge={isCharge}
            suggestedId={suggestedId}
            confirmPending={confirmMut.isPending}
            ignorePending={ignoreMut.isPending}
            unmatchPending={unmatchMut.isPending}
            onConfirmSuggested={handleConfirmSuggested}
            onManualMatch={handleManualMatch}
            onIgnore={handleIgnore}
            onUnmatch={handleUnmatch}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
