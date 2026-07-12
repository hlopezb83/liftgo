import { SuccessIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateDisplay } from "@/lib/utils";
import { useReconciliationStatus } from "../hooks/useReconciliationStatus";

interface Props {
  paymentId?: string | null;
  supplierPaymentId?: string | null;
}

export function ReconciliationBadge({ paymentId, supplierPaymentId }: Props) {
  const { data } = useReconciliationStatus({ paymentId, supplierPaymentId });
  if (!data) return null;
  const last4 = data.bank_last4 ? ` ····${data.bank_last4}` : "";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-status-available text-white border-transparent text-[10px] gap-1">
            <SuccessIcon className="h-3 w-3" />
            Conciliado {formatDateDisplay(data.matched_at)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {data.bank_account_name}{last4}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
