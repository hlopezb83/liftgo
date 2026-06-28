import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ManualMatchPicker } from "./ManualMatchPicker";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  line: BankStatementLine;
  isCharge: boolean;
  suggestedId: string | null | undefined;
  confirmPending: boolean;
  ignorePending: boolean;
  unmatchPending: boolean;
  onConfirmSuggested: () => void;
  onManualMatch: (pid: string) => void;
  onIgnore: (reason: string) => void;
  onUnmatch: () => void;
}

export function BankLineActions({
  line, isCharge, suggestedId,
  confirmPending, ignorePending, unmatchPending,
  onConfirmSuggested, onManualMatch, onIgnore, onUnmatch,
}: Props) {
  const [ignoreReason, setIgnoreReason] = useState("");

  const showSuggested = line.status === "suggested" && Boolean(suggestedId);
  const showUnmatch = line.status === "matched" || line.status === "ignored";
  const showManual = line.status === "unmatched" || line.status === "suggested";

  const handleIgnore = () => {
    const reason = ignoreReason.trim();
    if (!reason) return;
    onIgnore(reason);
    setIgnoreReason("");
  };

  return (
    <>
      {showSuggested && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="text-sm font-medium mb-2">Pago sugerido</p>
          <p className="text-xs text-muted-foreground mb-2">Score: {line.match_score ?? "—"}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onConfirmSuggested} disabled={confirmPending}>Confirmar emparejamiento</Button>
          </div>
        </div>
      )}

      {showUnmatch && (
        <Button variant="outline" size="sm" onClick={onUnmatch} disabled={unmatchPending}>Deshacer</Button>
      )}

      {showManual && (
        <>
          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">Emparejar manualmente</p>
            <ManualMatchPicker kind={isCharge ? "supplier_payment" : "payment"} onSelect={onManualMatch} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs">Marcar como ignorado (comisión bancaria, gasto no registrado, etc.)</Label>
            <Textarea value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} placeholder="Razón..." rows={2} />
            <Button variant="ghost" size="sm" onClick={handleIgnore} disabled={!ignoreReason.trim() || ignorePending}>Ignorar</Button>
          </div>
        </>
      )}
    </>
  );
}
