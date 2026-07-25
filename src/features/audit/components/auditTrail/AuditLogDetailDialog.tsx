import { useQuery } from "@tanstack/react-query";
import { FormDialog } from "@/components/forms/FormDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogDetailBody } from "./AuditLogDetailBody";
import { translateAction, translateTable } from "./auditTrailConstants";
import { auditLogDetailQueries } from "../../lib/queryKeys";
import type { AuditLog } from "../../hooks/useAuditLogs";

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

// v7.233.0 (P1-4b): la lista ya no trae old_data/new_data; el detalle los
// re-descarga por id sólo cuando el diálogo se abre.
export function AuditLogDetailDialog({ log, onClose }: Props) {
  const { data: full, isLoading } = useQuery({
    ...auditLogDetailQueries.list({ id: log?.id ?? "" }),
    enabled: !!log,
  });

  const merged: AuditLog | null = log && full ? { ...log, ...full } : log;
  const title = merged
    ? `${translateAction(merged.action)} — ${translateTable(merged.table_name)}`
    : "Detalle de bitácora";

  return (
    <FormDialog
      open={!!log}
      onOpenChange={(open) => !open && onClose()}
      width="2xl"
      title={title}
    >
      {isLoading && !full ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        merged && <AuditLogDetailBody log={merged} />
      )}
    </FormDialog>
  );
}
