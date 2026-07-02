import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-status-rented text-white border-transparent",
  success: "bg-status-available text-white border-transparent",
  warning: "bg-status-warning text-foreground border-transparent dark:text-background",
  destructive: "bg-destructive text-destructive-foreground border-transparent",
};

interface Props {
  invoiceStatus: string;
  cfdiStatus: string;
  cancellationStatus?: string | null;
  showPacBadge: boolean;
  isLive: boolean;
}

function resolveFiscalBadge(
  invoiceStatus: string,
  cfdiStatus: string,
  cancellationStatus: string | null | undefined,
): { label: string; tone: Tone } {
  if (invoiceStatus === "draft") return { label: "Borrador", tone: "neutral" };
  if (cfdiStatus === "cancelled" || invoiceStatus === "cancelled") {
    return { label: "Cancelada", tone: "destructive" };
  }
  if (cancellationStatus === "pending") {
    return { label: "Cancelación en proceso", tone: "warning" };
  }
  if (cfdiStatus === "stamped") {
    if (invoiceStatus === "paid") return { label: "Pagada", tone: "success" };
    if (invoiceStatus === "partial") return { label: "Parcial", tone: "warning" };
    if (invoiceStatus === "overdue") return { label: "Vencida", tone: "destructive" };
    return { label: "Timbrada", tone: "info" };
  }
  return { label: "Pendiente de timbrado", tone: "warning" };
}

export function InvoiceDetailBadges({
  invoiceStatus,
  cfdiStatus,
  cancellationStatus,
  showPacBadge,
  isLive,
}: Props) {
  const fiscal = resolveFiscalBadge(invoiceStatus, cfdiStatus, cancellationStatus);
  return (
    <>
      <Badge className={toneClass[fiscal.tone]}>{fiscal.label}</Badge>
      {showPacBadge && !isLive && (
        <Badge className={toneClass.warning}>Sandbox</Badge>
      )}
    </>
  );
}
