import { Button } from "@/components/ui/button";
import { UploadIcon } from "@/components/icons";
import { SupplierRepStatusBadge } from "./SupplierRepStatusBadge";
import { SupplierPaymentRepReceived } from "./SupplierPaymentRepReceived";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface Props {
  payment: SupplierPayment;
  repStatus: SupplierRepStatus;
  canAct: boolean;
  rejectPending: boolean;
  resetPending: boolean;
  onUpload: () => void;
  onReject: () => void;
  onReset: () => void;
}

export function SupplierPaymentRepSection({
  payment: p, repStatus, canAct,
  rejectPending, resetPending, onUpload, onReject, onReset,
}: Props) {
  const showUpload = canAct && (repStatus === "pending" || repStatus === "rejected");
  const uploadLabel = repStatus === "rejected" ? "Reintentar" : "Cargar REP";

  return (
    <div className="pt-1 border-t mt-1 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <SupplierRepStatusBadge status={repStatus} />
        {showUpload && (
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={onUpload}>
            <UploadIcon className="h-3 w-3 mr-1" /> {uploadLabel}
          </Button>
        )}
      </div>

      {repStatus === "received" && (
        <SupplierPaymentRepReceived
          payment={p}
          canAct={canAct}
          rejectPending={rejectPending}
          resetPending={resetPending}
          onReject={onReject}
          onReset={onReset}
        />
      )}

      {repStatus === "rejected" && p.rep_notes && (
        <p className="text-destructive">Motivo: {p.rep_notes}</p>
      )}
    </div>
  );
}
