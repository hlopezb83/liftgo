import { StatusBadge } from "@/components/feedback/StatusBadge";
import {
  SUPPLIER_REP_STATUS_LABELS,
  type SupplierRepStatus,
} from "../lib/supplierRepConstants";

// Mapea el estado del REP al tono semántico del StatusBadge global.
const STATUS_MAP: Record<SupplierRepStatus, string> = {
  not_required: "draft",
  pending: "pending",
  received: "confirmed",
  rejected: "cancelled",
};

export function SupplierRepStatusBadge({ status }: { status: SupplierRepStatus }) {
  return (
    <StatusBadge
      status={STATUS_MAP[status]}
      label={`REP: ${SUPPLIER_REP_STATUS_LABELS[status]}`}
    />
  );
}
