import { useState } from "react";
import { SuccessIcon, X, ResetIcon, SecurityIcon, ShieldAlert, SpinnerIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserRole } from "@/features/users";
import { formatDateDisplay } from "@/lib/utils";
import { useSupplierBillApprovals } from "../hooks/useBillApprovalHistory";
import { useRequestBillReapproval } from "../hooks/useBillApprovalMutations";
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_ACTION_LABELS,
  type SupplierBillApprovalStatus,
} from "../lib/supplierBillConstants";
import { ApproveBillDialog } from "./ApproveBillDialog";
import { RejectBillDialog } from "./RejectBillDialog";

interface Props {
  billId: string;
  billNumber: string;
  approvalStatus: SupplierBillApprovalStatus;
  approvalNotes: string | null;
  approvedAt: string | null;
}

function StatusBadgeApproval({ status }: { status: SupplierBillApprovalStatus }) {
  const tone: Record<SupplierBillApprovalStatus, string> = {
    not_required: "bg-muted text-muted-foreground",
    pending: "bg-status-warning text-foreground dark:text-background",
    approved: "bg-status-available text-white",
    rejected: "bg-destructive text-destructive-foreground",
  };
  return (
    <Badge className={`${tone[status]} border-transparent`}>
      {APPROVAL_STATUS_LABELS[status]}
    </Badge>
  );
}

interface HistoryEntry {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  notes: string | null;
}

function ApprovalTimeline({ history, isLoading }: { history: HistoryEntry[] | undefined; isLoading: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">
        Bitácora ({history?.length ?? 0})
      </p>
      {isLoading ? (
        <SpinnerIcon className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !history || history.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin movimientos</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-md border p-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{APPROVAL_ACTION_LABELS[h.action] ?? h.action}</span>
                <span className="text-muted-foreground">{formatDateDisplay(h.created_at)}</span>
              </div>
              <p className="text-muted-foreground">
                {h.actor_name ?? "Sistema"}
                {h.notes && <> · {h.notes}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalActions({
  status, isAdmin, isAdministrativo, onApprove, onReject,
  reapprovalPending, onReapproval,
}: {
  status: SupplierBillApprovalStatus;
  isAdmin: boolean;
  isAdministrativo: boolean;
  onApprove: () => void;
  onReject: () => void;
  reapprovalPending: boolean;
  onReapproval: () => void;
}) {
  if (status === "pending" && isAdmin) {
    return (
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onApprove}>
          <SuccessIcon className="h-4 w-4 mr-1" /> Aprobar
        </Button>
        <Button size="sm" variant="destructive" className="flex-1" onClick={onReject}>
          <X className="h-4 w-4 mr-1" /> Rechazar
        </Button>
      </div>
    );
  }
  if (status === "rejected" && (isAdmin || isAdministrativo)) {
    return (
      <Button size="sm" variant="outline" disabled={reapprovalPending} onClick={onReapproval}>
        <ResetIcon className="h-4 w-4 mr-1" />
        {reapprovalPending ? "Enviando…" : "Solicitar reaprobación"}
      </Button>
    );
  }
  return null;
}

export function BillApprovalSection({
  billId, billNumber, approvalStatus, approvalNotes, approvedAt,
}: Props) {
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  const isAdministrativo = role === "administrativo";

  const { data: history, isLoading } = useSupplierBillApprovals(
    approvalStatus === "not_required" ? null : billId,
  );
  const reapproval = useRequestBillReapproval();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  if (approvalStatus === "not_required") return null;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {approvalStatus === "approved" ? (
              <SecurityIcon className="h-4 w-4 text-success" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-warning" />
            )}
            <span className="text-sm font-semibold">Aprobación</span>
          </div>
          <StatusBadgeApproval status={approvalStatus} />
        </div>

        {approvalNotes && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            <strong>Notas:</strong> {approvalNotes}
          </p>
        )}
        {approvedAt && approvalStatus !== "pending" && (
          <p className="text-xs text-muted-foreground">
            {approvalStatus === "approved" ? "Aprobada" : "Rechazada"} el{" "}
            {formatDateDisplay(approvedAt)}
          </p>
        )}

        <ApprovalActions
          status={approvalStatus}
          isAdmin={isAdmin}
          isAdministrativo={isAdministrativo}
          onApprove={() => setApproveOpen(true)}
          onReject={() => setRejectOpen(true)}
          reapprovalPending={reapproval.isPending}
          onReapproval={() => reapproval.mutate({ billId })}
        />

        <ApprovalTimeline history={history} isLoading={isLoading} />
      </div>

      <ApproveBillDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        billId={billId}
        billNumber={billNumber}
      />
      <RejectBillDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        billId={billId}
        billNumber={billNumber}
      />
    </>
  );
}
