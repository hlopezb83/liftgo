// El canónico vive junto a las Edge Functions para que el bundle de Supabase
// siempre lo incluya. Este barrel mantiene una ruta propia del feature para la UI.
export {
  type CreditNoteDiscountSelection,
  type CreditNoteDiscountType,
  creditNoteDiscountForSelection,
} from "../../../../supabase/functions/_shared/creditNoteDiscount";
