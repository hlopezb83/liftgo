// Endpoints retirados (fail-closed).
//
// Tramo 11 (auditoría multiempresa): las Edge Functions de administración de
// usuarios y de invitación al portal autorizaban por rol GLOBAL
// (`user_roles.role`) y operaban con `service_role`, sin resolver ni validar la
// organización del actor ni la del usuario objetivo. En un ERP multiempresa eso
// permitiría que un admin de la empresa A invitara, desactivara, borrara o
// restableciera la contraseña de un usuario de la empresa B.
//
// Su reemplazo org-scoped ya vive en server functions de TanStack
// (`src/lib/userAdmin.functions.ts`, `src/lib/customerPortal.functions.ts`),
// que derivan la organización de la membresía interna activa
// (`requireInternalOrganization`) y crean usuarios con
// `app_metadata.organization_id` (canal confiable de 0033).
//
// Estas rutas quedan aquí únicamente para responder 410 de forma explícita:
// no ejecutan ninguna operación privilegiada bajo ninguna circunstancia, ni
// siquiera con un JWT válido de admin o de service_role.
import { handleCors } from "./cors.ts";
import { jsonResponse } from "./http.ts";

export const RETIRED_ENDPOINT_CODE = "ENDPOINT_RETIRED_MULTITENANT";

/** Reemplazo org-scoped documentado para cada endpoint retirado. */
export const RETIRED_ENDPOINT_REPLACEMENTS: Record<string, string> = {
  "invite-user": "src/lib/userAdmin.functions.ts#inviteUserFn",
  "delete-user": "src/lib/userAdmin.functions.ts#deleteUserFn",
  "reset-user-password": "src/lib/userAdmin.functions.ts#resetUserPasswordFn",
  "toggle-user-status": "src/lib/userAdmin.functions.ts#toggleUserStatusFn",
  "invite-customer": "src/lib/customerPortal.functions.ts#inviteCustomerFn",
};

export function retiredEndpointResponse(req: Request, name: string): Response {
  return jsonResponse(
    req,
    {
      error:
        `${RETIRED_ENDPOINT_CODE}: el endpoint '${name}' fue retirado porque autorizaba por rol global sin validar la organización.`,
      code: RETIRED_ENDPOINT_CODE,
      replacement: RETIRED_ENDPOINT_REPLACEMENTS[name] ?? null,
    },
    { status: 410 },
  );
}

/**
 * Handler fail-closed: sólo responde CORS al preflight y 410 en cualquier otro
 * método. Nunca lee el cuerpo, nunca crea clientes privilegiados.
 */
export function makeRetiredEndpointHandler(
  name: string,
): (req: Request) => Response {
  return (req: Request) => {
    const corsRes = handleCors(req);
    if (corsRes) return corsRes;
    return retiredEndpointResponse(req, name);
  };
}
