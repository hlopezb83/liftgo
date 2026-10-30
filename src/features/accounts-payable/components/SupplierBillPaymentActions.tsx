import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { CreditCard } from "@/components/icons";
import { supplierBillPaymentBlock } from "../lib/billPermissions";
import type { Ref } from "react";

interface BillActionsState {
  status: string;
  approval_status: string;
  payments: unknown[];
}

interface Props {
  bill: BillActionsState;
  onPayClick: () => void;
  paymentTriggerRef?: Ref<HTMLButtonElement>;
}

export function SupplierBillPaymentActions({
  bill, onPayClick, paymentTriggerRef,
}: Props) {
  return (
    <BlockedActionButton
      ref={paymentTriggerRef}
      className="w-full"
      block={supplierBillPaymentBlock(bill)}
      onClick={onPayClick}
    >
      <CreditCard className="h-4 w-4 mr-1" /> Registrar pago
    </BlockedActionButton>
  );
}
