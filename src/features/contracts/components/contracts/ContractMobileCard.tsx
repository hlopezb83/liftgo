import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronRightIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";
import { getContractExpiryLabel, getContractExpiryState } from "../../lib/contractExpiry";
import { CONTRACT_STATUS_LABELS } from "../../lib/contractStatusLabels";

export interface ContractCardItem {
  id: string;
  contract_number: string;
  status: string;
  customer_name?: string | null;
  forklift_name?: string | null;
  start_date: string | null;
  end_date: string | null;
}

/** Tarjeta móvil de contratos (extraída de ContractsPage para respetar el límite de líneas). */
export function ContractMobileCard({ contract, onClick }: { contract: ContractCardItem; onClick: () => void }) {
  const expiry = getContractExpiryState(contract.end_date, contract.status);
  const expiryLabel = getContractExpiryLabel(expiry);
  return (
    <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono font-semibold text-sm">{contract.contract_number}</span>
          <div className="flex items-center gap-1.5">
            {expiryLabel && (
              <Badge
                variant={expiry === "expired" ? "destructive" : "outline"}
                className={expiry === "expiring_soon" ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}
              >
                {expiryLabel}
              </Badge>
            )}
            <StatusBadge status={contract.status} label={CONTRACT_STATUS_LABELS[contract.status]} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{contract.customer_name || "Sin cliente"}</p>
        {contract.forklift_name && (
          <p className="text-xs text-muted-foreground mt-1">Equipo: {contract.forklift_name}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {formatDateRange(contract.start_date, contract.end_date)}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
