// El canónico vive junto a las Edge Functions para que el bundle de Supabase
// siempre lo incluya. Este barrel mantiene una ruta propia del feature para la UI.
export {
  creditNoteDiscountForSelection,
} from "../../../../supabase/functions/_shared/creditNoteDiscount";
