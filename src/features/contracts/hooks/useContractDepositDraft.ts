import { useState } from "react";
import { ContractDepositConflictError, type ContractDepositSnapshot, type DepositStatus } from "../lib/contractDepositRpc";
import { useSetContractDepositStatus } from "./useContracts";

type Props = ContractDepositSnapshot & { contractId: string; onReload: () => Promise<ContractDepositSnapshot> };

function createDraft(baseline: ContractDepositSnapshot) {
  return { baseline, status: (baseline.depositStatus ?? "held") as DepositStatus,
    settledAmount: baseline.depositSettledAmount == null ? "" : String(baseline.depositSettledAmount),
    notes: baseline.depositNotes ?? "" };
}

function validAmount(status: DepositStatus, input: string, limit: number) {
  return status === "held" || input === "" || (Number.isFinite(Number(input)) && Number(input) >= 0 && Number(input) <= limit);
}

function getFormState({ baseline, status, settledAmount, notes }: ReturnType<typeof createDraft>) {
  const amount = Number(baseline.depositAmount ?? 0);
  const amountInput = settledAmount.trim();
  const storedAmount = Number(baseline.depositSettledAmount ?? amount);
  const current = baseline.depositStatus ?? "held";
  const currentAmount = current === "held" ? null : storedAmount;
  const nextAmount = status === "held" ? null : Number(amountInput === "" ? storedAmount : amountInput);
  return {
    amount,
    defaultAmount: storedAmount,
    amountValid: validAmount(status, amountInput, amount),
    hasChanges: status !== current || nextAmount !== currentAmount || notes.trim() !== (baseline.depositNotes ?? "").trim(),
    amountToSubmit: status === "held" || amountInput === "" ? null : Number(amountInput),
    notesToSubmit: notes.trim() === "" ? null : notes.trim(),
  };
}

export function useContractDepositDraft(props: Props) {
  // Keep the revision with its draft. A refetch must not authorize old fields
  // with a newer revision; only an explicit reload or confirmed save replaces it.
  const [draft, setDraft] = useState(() => createDraft(props));
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const mutation = useSetContractDepositStatus();
  const conflict = mutation.error instanceof ContractDepositConflictError;
  const changed = props.updatedAt !== draft.baseline.updatedAt;
  const busy = mutation.isPending || isReloading;
  const formState = getFormState(draft);
  const resetDraft = (snapshot: ContractDepositSnapshot) => {
    setDraft(createDraft(snapshot));
    setReloadError(false);
    mutation.reset();
  };
  const reloadDeposit = async () => {
    setIsReloading(true);
    setReloadError(false);
    try { resetDraft(await props.onReload()); }
    catch { setReloadError(true); }
    finally { setIsReloading(false); }
  };
  return {
    ...draft, formState, busy, isReloading, reloadError, isPending: mutation.isPending,
    needsReload: conflict || changed || reloadError,
    saveDisabled: busy || conflict || changed || !formState.hasChanges || !formState.amountValid,
    visible: Number(props.depositAmount ?? 0) > 0 || formState.amount > 0,
    setStatus: (status: DepositStatus) => setDraft(value => ({ ...value, status })),
    setSettledAmount: (settledAmount: string) => setDraft(value => ({ ...value, settledAmount })),
    setNotes: (notes: string) => setDraft(value => ({ ...value, notes })),
    reloadDeposit,
    handleSave: () => mutation.mutate({
      contractId: props.contractId, expectedUpdatedAt: draft.baseline.updatedAt,
      status: draft.status, amount: formState.amountToSubmit, notes: formState.notesToSubmit,
    }, { onSuccess: resetDraft }),
  };
}
