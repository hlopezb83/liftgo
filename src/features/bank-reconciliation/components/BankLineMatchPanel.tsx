import { useState } from "react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import {
  useConfirmBankMatch,
  useIgnoreBankLine,
  useUnmatchBankLine,
} from "../hooks/useBankReconciliationMutations";
import { BANK_LINE_STATUS_LABELS } from "../lib/bankReconciliationConstants";
import { BankMatchCandidateList } from "./BankMatchCandidateList";
import type { BankMatchCandidate, DateWindow } from "../hooks/useBankMatchCandidates";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  line: BankStatementLine;
  /** Moneda de la cuenta bancaria (los importes se expresan en ella). */
  currency: string;
  /** Se invoca al completar una acción (conciliar / ignorar / deshacer). */
  onDone: () => void;
}

const LINE_STATUS_TONE: Record<string, string> = {
  unmatched: "draft",
  suggested: "pending",
  matched: "confirmed",
  ignored: "inactive",
};

// F7: la tabla destino la decide el `kind` que expone el RPC
// (`payment` → payments, `supplier_payment` → supplier_payments), no el signo
// de la línea — un abono podía emparejarse contra supplier_payments y viceversa.
function matchTarget(kind: BankMatchCandidate["kind"], id: string) {
  return {
    paymentId: kind === "payment" ? id : undefined,
    supplierPaymentId: kind === "supplier_payment" ? id : undefined,
  };
}

/** Encabezado del panel: importe, estado y datos del movimiento bancario. */
function BankLineSummary({ line, isCharge, currency }: { line: BankStatementLine; isCharge: boolean; currency: string }) {
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {isCharge ? "Cargo" : "Abono"} · {formatDateDisplay(line.posted_date)}
          </p>
          <p className="truncate text-sm font-medium">{line.description || "—"}</p>
        </div>
        <StatusBadge
          status={LINE_STATUS_TONE[line.status] ?? "draft"}
          label={BANK_LINE_STATUS_LABELS[line.status]}
        />
      </div>
      <p
        className={cn(
          "font-mono text-lg font-semibold tabular-nums",
          isCharge ? "text-destructive" : "text-success",
        )}
      >
        {formatCurrencyWithCode(line.signed_amount, currency)}
      </p>
      {line.reference && (
        <p className="text-xs text-muted-foreground">
          Ref: <span className="font-mono">{line.reference}</span>
        </p>
      )}
      {line.ignored_reason && (
        <p className="text-xs text-muted-foreground">Razón: {line.ignored_reason}</p>
      )}
    </div>
  );
}


export function BankLineMatchPanel({ line, currency, onDone }: Props) {
  const [search, setSearch] = useState("");
  const [dateWindow, setDateWindow] = useState<DateWindow>(15);
  const [ignoreReason, setIgnoreReason] = useState("");

  const confirmMut = useConfirmBankMatch();
  const ignoreMut = useIgnoreBankLine();
  const unmatchMut = useUnmatchBankLine();

  const isCharge = line.signed_amount < 0;
  const suggestedId = isCharge ? line.suggested_supplier_payment_id : line.suggested_payment_id;
  const canAct = line.status === "unmatched" || line.status === "suggested";
  const canUndo = line.status === "matched" || line.status === "ignored";

  const doMatch = (candidateId: string, kind: BankMatchCandidate["kind"]) => {
    confirmMut.mutate(
      {
        lineId: line.id,
        bankAccountId: line.bank_account_id,
        ...matchTarget(kind, candidateId),
      },
      { onSuccess: onDone },
    );
  };

  const handleIgnore = () => {
    const reason = ignoreReason.trim();
    if (!reason) return;
    ignoreMut.mutate(
      { lineId: line.id, bankAccountId: line.bank_account_id, reason },
      {
        onSuccess: () => {
          setIgnoreReason("");
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-4" data-testid="bank-match-panel">
      <BankLineSummary line={line} isCharge={isCharge} currency={currency} />


      {line.status === "suggested" && suggestedId && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="text-sm font-medium">Pago sugerido automáticamente</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Score: {line.match_score ?? "—"}
          </p>
          <Button
            size="sm"
            disabled={confirmMut.isPending}
            // El id sugerido ya viene por columna: suggested_supplier_payment_id
            // apunta a supplier_payments; suggested_payment_id a payments.
            onClick={() =>
              doMatch(
                suggestedId,
                line.suggested_supplier_payment_id != null ? "supplier_payment" : "payment",
              )
            }
          >
            Confirmar emparejamiento
          </Button>
        </div>
      )}

      {canUndo && (
        <Button
          variant="outline"
          size="sm"
          disabled={unmatchMut.isPending}
          onClick={() =>
            unmatchMut.mutate(
              { lineId: line.id, bankAccountId: line.bank_account_id },
              { onSuccess: onDone },
            )
          }
        >
          Deshacer
        </Button>
      )}

      {canAct && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Candidatos
            </p>
            <BankMatchCandidateList
              lineId={line.id}
              search={search}
              onSearchChange={setSearch}
              dateWindow={dateWindow}
              onDateWindowChange={setDateWindow}
              onSelect={doMatch}
              disabled={confirmMut.isPending}
            />
          </div>

          <Separator />
          <div className="space-y-2">
            <Label className="text-xs">
              Marcar como ignorado (comisión bancaria, gasto no registrado, etc.)
            </Label>
            <Textarea
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              data-testid="bank-panel-ignore-reason"
              placeholder="Razón…"
              rows={2}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleIgnore}
              disabled={!ignoreReason.trim() || ignoreMut.isPending}
              data-testid="bank-panel-ignore-submit"
            >
              Ignorar movimiento
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
