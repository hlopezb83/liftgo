import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadges } from "../InvoiceStatusBadges";

interface Props {
  invoiceStatus: string;
  cfdiStatus: string;
  cancellationStatus?: string | null;
  showSandboxChip: boolean;
  /** R2 (bajo 7): CFDI timbrado pero el XML aún no se ha recuperado del PAC. */
  cfdiXmlPending?: boolean;
}

export function InvoiceDetailBadges({
  invoiceStatus,
  cfdiStatus,
  cancellationStatus,
  showSandboxChip,
  cfdiXmlPending,
}: Props) {
  return (
    <>
      <InvoiceStatusBadges invoiceStatus={invoiceStatus} cfdiStatus={cfdiStatus} cancellationStatus={cancellationStatus} />
      {cfdiXmlPending && (
        <div data-tone="warning" className="inline-flex"><StatusBadge status="pending" label="XML por recuperar" /></div>
      )}
      {/* Sandbox es entorno, no estado: insignia neutral separada, sin punto. */}
      {showSandboxChip && (
        <Badge variant="outline" data-testid="sandbox-chip" className="font-medium text-muted-foreground">Sandbox</Badge>
      )}
    </>
  );
}
