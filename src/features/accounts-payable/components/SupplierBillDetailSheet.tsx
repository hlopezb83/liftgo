import { Activity, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentIcon, SpinnerIcon } from "@/components/icons";
import { useSupplierBill } from "../hooks/useSupplierBill";
import { useDeleteSupplierBill } from "../hooks/useSupplierBillMutations";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { computeBillPermissions } from "../lib/billPermissions";
import { SupplierBillDetailContent } from "./SupplierBillDetailContent";

interface Props {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupplierBillDetailSheet({ billId, open, onOpenChange }: Props) {
  const { data: bill, isLoading } = useSupplierBill(open ? billId : null);
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
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <DocumentIcon className="h-5 w-5" />
            {bill?.bill_number ?? "Cargando…"}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !bill ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <SpinnerIcon className="h-5 w-5 animate-spin" />
          </div>
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
      </SheetContent>
    </Sheet>
  );
}
