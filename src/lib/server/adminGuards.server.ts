/**
 * Fachada de compatibilidad de los guards administrativos del servidor.
 *
 * La implementación vive en `src/lib/server/guards/*` (validación, contraseña,
 * rol, rate limit, alcance de empresa y operador de plataforma). Este archivo
 * mantiene exactamente la API previa para todos los consumidores existentes:
 * mismos nombres, mismos tipos, mismo comportamiento fail-closed.
 */
export {
  type AdminClient,
  type AppRole,
  type AuthorizedCaller,
  type CallerClient,
  HttpError,
} from "./guards/httpError";

export {
  isEmail,
  isNonEmptyString,
  isUUID,
  isValidRole,
} from "./guards/validation";

export { generateSecurePassword } from "./guards/password";

export { requireAdmin, requireRole } from "./guards/roleAuthorization.server";

export { enforceRateLimit } from "./guards/rateLimit.server";

export {
  assertTargetInOrganization,
  createInternalMembership,
  requireInternalOrganization,
} from "./guards/organizationScope.server";

export {
  asUntypedRpc,
  requirePlatformOperator,
  type UntypedRpcClient,
} from "./guards/platformOperator.server";
