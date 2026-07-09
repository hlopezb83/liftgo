import { FormDialog } from "@/components/forms/FormDialog";
import type { AuditLog } from "../../hooks/useAuditLogs";
import { translateAction, translateTable } from "./auditTrailConstants";
import { AuditLogDetailBody } from "./AuditLogDetailBody";

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

export function AuditLogDetailDialog({ log, onClose }: Props) {
  const title = log
    ? `${translateAction(log.action)} — ${translateTable(log.table_name)}`
    : "Detalle de bitácora";

  return (
    <FormDialog
      open={!!log}
      onOpenChange={(open) => !open && onClose()}
      width="2xl"
      title={title}
    >
      {log && <AuditLogDetailBody log={log} />}
    </FormDialog>
  );
}
