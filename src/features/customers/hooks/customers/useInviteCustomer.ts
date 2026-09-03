import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { customerKeys } from "../../lib/queryKeys";

interface InviteCustomerVars {
  customerId: string;
  email: string;
}

interface InviteCustomerResponse {
  success?: boolean;
  user_id?: string;
  /** Enlace de acceso de un solo uso para compartir con el cliente. */
  portal_link?: string;
}

/**
 * Traducción de los mensajes que devuelve la edge function (en inglés) a
 * español. Los códigos HTTP y las reglas del backend no cambian: esto es
 * únicamente capa de presentación para que el usuario vea el motivo real en
 * vez de "Edge Function returned a non-2xx status code".
 */
const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/insufficient role|forbidden/i, "No tienes permisos para invitar clientes al portal."],
  [/already has portal access/i, "Este cliente ya tiene acceso al portal."],
  [/archived or not found/i, "El cliente está archivado o no existe."],
  [/valid email/i, "El correo electrónico no es válido."],
  [/valid uuid/i, "El cliente indicado no es válido."],
  [/rate limit|too many/i, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."],
  [/cuenta desactivada/i, "Tu cuenta está desactivada."],
];

function translateInviteError(raw: string): string {
  const match = ERROR_MESSAGES.find(([re]) => re.test(raw));
  return match ? match[1] : raw;
}

/**
 * Crea acceso al portal de clientes mediante el edge function `invite-customer`.
 */
export function useInviteCustomer() {
  return useEntityMutation<InviteCustomerVars, InviteCustomerResponse | null>({
    mutationFn: async ({ customerId, email }: InviteCustomerVars) => {
      // `invokeEdgeFunction` extrae el cuerpo JSON de las respuestas no-2xx,
      // que el SDK de Supabase esconde tras un mensaje genérico.
      return await invokeEdgeFunction<InviteCustomerResponse | null>("invite-customer", {
        body: { customer_id: customerId, email },
      });
    },
    invalidateKeys: [customerKeys.all],
    onSuccess: (_data, { email }) => {
      notifySuccess("Acceso al portal creado", {
        description: `Comparte el enlace de acceso con ${email}`,
      });
    },
    errorTitle: "No se pudo invitar al portal",
    errorMessage: (error) =>
      translateInviteError(error instanceof Error ? error.message : String(error)),
  });
}
