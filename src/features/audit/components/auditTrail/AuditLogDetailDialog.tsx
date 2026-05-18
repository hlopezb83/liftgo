import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import { actionIcon, translateAction, translateTable } from "./auditTrailConstants";
import { AuditLogDetailBody } from "./AuditLogDetailBody";

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

export function AuditLogDetailDialog({ log, onClose }: Props) {
  return (
    <Dialog open={!!log} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {log && actionIcon(log.action)}
            {log && translateAction(log.action)} — {log && translateTable(log.table_name)}
          </DialogTitle>
        </DialogHeader>
        {log && <AuditLogDetailBody log={log} />}
      </DialogContent>
    </Dialog>
  );
}
