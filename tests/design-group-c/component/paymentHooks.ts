function rejectMutation(): Promise<never> { throw new Error("Fixture read-only: payment/upload mutation blocked"); }
export function useRegisterSupplierPayment() { return { isPending: false, mutateAsync: rejectMutation }; }
export function useUploadSupplierReceipt() { return { isPending: false, mutateAsync: rejectMutation }; }
export const removeSupplierReceipt = rejectMutation;
