// Barrel re-exports. Implementations live in ./useCreditNotesQueries and ./useCreditNoteMutations.
export { useCreditNotesForInvoice, type CreditNote } from "./useCreditNotesQueries";
export {
  useCreateCreditNote,
  useStampCreditNote,
  useCancelCreditNote,
  useDeleteCreditNote,
} from "./useCreditNoteMutations";
