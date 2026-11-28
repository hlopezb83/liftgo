// El canónico vive junto a las Edge Functions para garantizar paridad exacta
// del dígito verificador del RFC entre cliente y servidor.
export {
  hasValidRfcChecksum,
  validateRfcOrMessage,
} from "../../../supabase/functions/_shared/rfcChecksum";
