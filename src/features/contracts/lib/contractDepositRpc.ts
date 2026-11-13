import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type DepositStatus = "held" | "applied" | "returned";
export type ContractDepositSnapshot = {
  updatedAt: string;
  depositAmount: number | string | null;
  depositStatus: string | null;
  depositSettledAt: string | null;
  depositSettledAmount: number | string | null;
  depositNotes: string | null;
};
export type SetContractDepositInput = {
  contractId: string;
  expectedUpdatedAt: string;
  status: DepositStatus;
  amount?: number | null;
  notes?: string | null;
};

export class ContractDepositConflictError extends Error {
  readonly code = "40001";
  constructor() {
    super("El contrato cambió desde que abriste el depósito. Recarga el depósito y revisa los datos antes de guardar.");
    this.name = "ContractDepositConflictError";
  }
}

const snapshotSchema = z.object({
  updated_at: z.iso.datetime({ offset: true }),
  deposit_amount: z.number().finite().nullable(),
  deposit_status: z.enum(["held", "applied", "returned"]),
  deposit_settled_at: z.iso.datetime({ offset: true }).nullable(),
  deposit_settled_amount: z.number().finite().nullable(),
  deposit_notes: z.string().nullable(),
});

// Local contract for migration 0143; generated Supabase types stay untouched.
type DepositRpc = (name: "set_contract_deposit_status_checked", args: {
  p_contract_id: string; p_expected_updated_at: string; p_status: DepositStatus;
  p_amount: number | null; p_notes: string | null;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export async function setContractDeposit(input: SetContractDepositInput): Promise<ContractDepositSnapshot> {
  if (!input.expectedUpdatedAt) throw new ContractDepositConflictError();
  const rpc = supabase.rpc.bind(supabase) as unknown as DepositRpc;
  const { data, error } = await rpc("set_contract_deposit_status_checked", {
    p_contract_id: input.contractId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_status: input.status,
    p_amount: input.amount ?? null,
    p_notes: input.notes ?? null,
  });
  if (error?.code === "40001") throw new ContractDepositConflictError();
  if (error) throw error;
  const row = snapshotSchema.parse(data);
  return {
    updatedAt: row.updated_at, depositAmount: row.deposit_amount, depositStatus: row.deposit_status,
    depositSettledAt: row.deposit_settled_at, depositSettledAmount: row.deposit_settled_amount,
    depositNotes: row.deposit_notes,
  };
}
