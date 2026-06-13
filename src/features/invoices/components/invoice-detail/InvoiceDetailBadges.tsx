import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/feedback/StatusBadge";

const cfdiBadgeClass = (status: string) =>
  status === "stamped"
    ? "bg-status-available text-white border-transparent"
    : status === "cancelled"
    ? "bg-destructive text-destructive-foreground border-transparent"
    : "bg-status-maintenance text-white border-transparent";

const CFDI_BADGE_LABELS: Record<string, string> = {
  pending: "Pendiente CFDI",
  stamped: "Timbrado",
  cancelled: "CFDI Cancelado",
};

interface Props {
  invoiceStatus: string;
  cfdiStatus: string;
  showPacBadge: boolean;
  isLive: boolean;
}

export function InvoiceDetailBadges({ invoiceStatus, cfdiStatus, showPacBadge, isLive }: Props) {
  const cfdiLabel = CFDI_BADGE_LABELS[cfdiStatus] ?? cfdiStatus;
  const pacClass = isLive
    ? "border-status-available text-status-available"
    : "border-status-maintenance text-status-maintenance";
  const pacLabel = isLive ? "PAC: Producción" : "PAC: Sandbox";
  return (
    <>
      <StatusBadge status={invoiceStatus} />
      <Badge className={cfdiBadgeClass(cfdiStatus)}>{cfdiLabel}</Badge>
      {showPacBadge && (
        <Badge variant="outline" className={pacClass}>{pacLabel}</Badge>
      )}
    </>
  );
}
