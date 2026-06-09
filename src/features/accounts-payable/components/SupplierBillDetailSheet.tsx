import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { CreditCard, FileText, XCircle, Loader2 } from "lucide-react";
import { useSupplierBill } from "../hooks/useSupplierBill";
import {
  SUPPLIER_BILL_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from "../lib/supplierBillConstants";
import { RegisterSupplierPaymentDialog } from "./RegisterSupplierPaymentDialog";
import { CancelSupplierBillDialog } from "./CancelSupplierBillDialog";
import { BillApprovalSection } from "./BillApprovalSection";
import { SupplierPaymentRow } from "./SupplierPaymentRow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value || "—"}</span>
    </div>
  );
}

export function SupplierBillDetailSheet({ billId, open, onOpenChange }: Props) {
  const { data: bill, isLoading } = useSupplierBill(open ? billId : null);
  const [payDialog, setPayDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {bill?.bill_number ?? "Cargando…"}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !bill ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={bill.status} label={SUPPLIER_BILL_STATUS_LABELS[bill.status]} />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="text-xl font-bold font-mono">{formatCurrencyWithCode(Number(bill.balance), bill.currency)}</p>
              </div>
            </div>

            <Separator />
            <div className="space-y-0">
              <Row label="Proveedor" value={bill.suppliers?.name} />
              <Row label="RFC" value={bill.suppliers?.rfc} />
              <Row label="Categoría" value={bill.category ? EXPENSE_CATEGORY_LABELS[bill.category] : "—"} />
              <Row label="Emisión" value={formatDateDisplay(bill.issue_date)} />
              <Row label="Vencimiento" value={formatDateDisplay(bill.due_date)} />
            </div>

            <Separator />
            <div className="space-y-0">
              <Row label="Subtotal" value={formatCurrencyWithCode(Number(bill.subtotal), bill.currency)} />
              <Row label="IVA" value={formatCurrencyWithCode(Number(bill.tax_amount), bill.currency)} />
              {Number(bill.retention_iva) > 0 && (
                <Row label="Ret. IVA" value={`-${formatCurrencyWithCode(Number(bill.retention_iva), bill.currency)}`} />
              )}
              {Number(bill.retention_isr) > 0 && (
                <Row label="Ret. ISR" value={`-${formatCurrencyWithCode(Number(bill.retention_isr), bill.currency)}`} />
              )}
              <Row label="Total" value={<strong>{formatCurrencyWithCode(Number(bill.total), bill.currency)}</strong>} />
              {bill.currency !== "MXN" && (
                <Row label="Tipo de cambio" value={bill.exchange_rate} />
              )}
              <Row label="Método SAT" value={bill.payment_method_sat} />
              <Row label="UUID" value={bill.cfdi_uuid ? <span className="font-mono text-xs">{bill.cfdi_uuid}</span> : "—"} />
            </div>

            {bill.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descripción</p>
                  <p className="text-sm whitespace-pre-wrap">{bill.description}</p>
                </div>
              </>
            )}

            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pagos aplicados ({bill.payments.length})
              </p>
              {bill.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Sin pagos registrados</p>
              ) : (
                <div className="space-y-2">
                  {bill.payments.map((p) => (
                    <SupplierPaymentRow key={p.id} payment={p} billId={bill.id} currency={bill.currency} />
                  ))}
                </div>
              )}
            </div>

            <BillApprovalSection
              billId={bill.id}
              billNumber={bill.bill_number}
              approvalStatus={bill.approval_status}
              approvalNotes={bill.approval_notes}
              approvedAt={bill.approved_at}
            />

            <Separator />
            <RoleGuard module="Cuentas por Pagar" minAccess="full">
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1">
                        <Button
                          className="w-full"
                          disabled={
                            bill.status === "paid" ||
                            bill.status === "cancelled" ||
                            bill.approval_status === "pending" ||
                            bill.approval_status === "rejected"
                          }
                          onClick={() => setPayDialog(true)}
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Registrar pago
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {(bill.approval_status === "pending" || bill.approval_status === "rejected") && (
                      <TooltipContent>
                        {bill.approval_status === "pending"
                          ? "Requiere aprobación"
                          : "La factura fue rechazada"}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="outline"
                  disabled={bill.status === "cancelled" || bill.payments.length > 0}
                  onClick={() => setCancelDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </RoleGuard>

            <RegisterSupplierPaymentDialog
              open={payDialog}
              onOpenChange={setPayDialog}
              billId={bill.id}
              billNumber={bill.bill_number}
              balance={Number(bill.balance)}
            />
            <CancelSupplierBillDialog
              open={cancelDialog}
              onOpenChange={setCancelDialog}
              billId={bill.id}
              billNumber={bill.bill_number}
              onCancelled={() => onOpenChange(false)}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
