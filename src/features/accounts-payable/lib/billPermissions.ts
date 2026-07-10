interface Bill {
  approval_status: string;
  status: string;
  payments: unknown[];
}

export interface BillPermissions {
  canEdit: boolean;
  canDelete: boolean;
  editBlockedReason: string | null;
  deleteBlockedReason: string | null;
}

const EMPTY: BillPermissions = { canEdit: false, canDelete: false, editBlockedReason: null, deleteBlockedReason: null };

function editReason(bill: Bill, hasPayments: boolean): string | null {
  if (bill.status === "cancelled") return "Factura cancelada";
  if (bill.status === "paid") return "Factura pagada";
  if (hasPayments) return "Tiene pagos registrados";
  if (bill.approval_status === "approved") return "Ya fue aprobada";
  if (bill.approval_status === "rejected") return "Fue rechazada";
  return null;
}

function deleteReason(bill: Bill, hasPayments: boolean): string | null {
  if (hasPayments) return "Tiene pagos registrados";
  if (bill.approval_status === "approved") return "Ya fue aprobada — usa Cancelar";
  if (bill.status === "cancelled") return "Ya está cancelada";
  return null;
}

export function computeBillPermissions(bill: Bill | null | undefined): BillPermissions {
  if (!bill) return EMPTY;
  const hasPayments = bill.payments.length > 0;
  const editBlockedReason = editReason(bill, hasPayments);
  const deleteBlockedReason = deleteReason(bill, hasPayments);
  return {
    canEdit: editBlockedReason === null,
    canDelete: deleteBlockedReason === null,
    editBlockedReason,
    deleteBlockedReason,
  };
}
