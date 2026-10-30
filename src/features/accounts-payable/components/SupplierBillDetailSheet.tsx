import { Activity, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DocumentIcon, SpinnerIcon } from "@/components/icons";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUserRole } from "@/features/users";
import { useSupplierBill } from "../hooks/useSupplierBill";
import { useDeleteSupplierBill } from "../hooks/useSupplierBillMutations";
import { computeBillPermissions } from "../lib/billPermissions";
import { SupplierBillDetailContent } from "./SupplierBillDetailContent";

interface Props {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional return target for callers opening the sheet without a trigger. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function SupplierBillDetailSheet({ billId, open, onOpenChange, onCloseAutoFocus }: Props) {
  const { data: bill, isLoading, isError, refetch } = useSupplierBill(open ? billId : null);
  const { data: role } = useUserRole();
  const deleteBill = useDeleteSupplierBill();
  const [payDialog, setPayDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  const isAdmin = role === "admin";
  const perms = computeBillPermissions(bill);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col gap-0 overflow-hidden p-0" onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader className="shrink-0 border-b px-6 py-5 pr-12 text-left">
          <SheetTitle className="flex items-start gap-2 [overflow-wrap:anywhere]">
            <DocumentIcon className="mt-0.5 h-5 w-5 shrink-0" />
            {bill?.bill_number ?? (isError ? "Error" : "Cargando…")}
          </SheetTitle>
        </SheetHeader>

        <Activity mode={open ? "visible" : "hidden"}>
        {/* A4-06: sin esta rama la query fallida dejaba el spinner infinito. */}
        {isError ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <QueryErrorState bare entity="el detalle de la factura de proveedor" onRetry={() => { void refetch(); }} />
          </div>
        ) : isLoading ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-12 text-muted-foreground">
            <div className="flex justify-center">
            <SpinnerIcon className="h-5 w-5 animate-spin" />
            </div>
          </div>
        ) : !bill ? (
          <p className="min-h-0 flex-1 overflow-y-auto px-6 py-12 text-center text-sm text-muted-foreground">Factura no encontrada</p>
        ) : (
          <SupplierBillDetailContent
            bill={bill as Parameters<typeof SupplierBillDetailContent>[0]["bill"]}
            perms={perms}
            isAdmin={isAdmin}
            dialogs={{
              payDialog, setPayDialog,
              cancelDialog, setCancelDialog,
              editDialog, setEditDialog,
              deleteDialog, setDeleteDialog,
            }}
            onClose={() => onOpenChange(false)}
            onDelete={() => {
              deleteBill.mutate(bill.id, {
                onSuccess: () => {
                  setDeleteDialog(false);
                  onOpenChange(false);
                },
              });
            }}
          />
        )}
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
