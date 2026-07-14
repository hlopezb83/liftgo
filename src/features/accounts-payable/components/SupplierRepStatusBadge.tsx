import { Badge } from "@/components/ui/badge";
import {
  SUPPLIER_REP_STATUS_LABELS,
  type SupplierRepStatus,
} from "../lib/supplierRepConstants";

const TONE: Record<SupplierRepStatus, string> = {
  not_required: "bg-muted text-muted-foreground",
  pending: "bg-status-warning text-foreground dark:text-background",
  received: "bg-status-available text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

export function SupplierRepStatusBadge({ status }: { status: SupplierRepStatus }) {
  return (
    <Badge className={`${TONE[status]} border-transparent text-[10px]`}>
      REP: {SUPPLIER_REP_STATUS_LABELS[status]}
    </Badge>
  );
}
