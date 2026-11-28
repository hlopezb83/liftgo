// El canónico vive junto a las Edge Functions para que CSF y timbrado CFDI 4.0
// apliquen exactamente el mismo saneo de razón social.
export {
  sanitizeCsfName,
  sanitizeLegalName,
} from "../../../../supabase/functions/_shared/sanitizeLegalName";
