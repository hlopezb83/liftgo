/**
 * Identidad verificada para separar la caché: usuario autenticado +
 * organización resuelta en servidor. Devuelve `null` mientras no esté lista.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { buildIdentityScope } from "@/lib/query/identityScope";

export function useVerifiedIdentityScope(): string | null {
  const { user } = useAuth();
  const org = useOrganizationContext();
  if (!user || org.status !== "ready") return null;
  return buildIdentityScope({
    userId: user.id,
    organizationId: org.organizationId,
    memberType: org.memberType,
  });
}

