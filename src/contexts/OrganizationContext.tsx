/* eslint-disable react-refresh/only-export-components */
/**
 * Contexto de organización para la aplicación.
 *
 * Estados separados y explícitos: `loading` (verificando), `error`
 * (no se pudo verificar), `no-membership` (usuario sin empresa válida) y
 * `ready`. Mientras no esté `ready` no debe renderizarse ni consultarse
 * información protegida.
 */
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { OrganizationContextResult } from "@/lib/organization/resolveOrganizationContext";
import { getOrganizationContext } from "@/lib/organizationContext.functions";


export type OrganizationContextState =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "error"; code: string }
  | { status: "no-membership"; reason: string }
  | {
    status: "ready";
    organizationId: string;
    memberType: "internal" | "portal";
    customerId: string | null;
  };

const OrgContext = createContext<OrganizationContextState>({ status: "loading" });

export const organizationContextKey = (userId?: string) =>
  ["organization-context", userId] as const;

function toState(
  payload: { context: OrganizationContextResult | null; errorCode: string | null } | undefined,
): OrganizationContextState {
  if (!payload) return { status: "loading" };
  if (payload.errorCode || !payload.context) {
    return { status: "error", code: payload.errorCode ?? "unexpected_error" };
  }
  if (payload.context.status === "no_membership") {
    return { status: "no-membership", reason: payload.context.reason };
  }
  return {
    status: "ready",
    organizationId: payload.context.organizationId,
    memberType: payload.context.memberType,
    customerId: payload.context.customerId,
  };
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: organizationContextKey(user?.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => getOrganizationContext(),
  });

  const value = useMemo<OrganizationContextState>(() => {
    if (authLoading) return { status: "loading" };
    if (!user) return { status: "signed-out" };
    if (query.isError) return { status: "error", code: "context_request_failed" };
    if (query.isPending) return { status: "loading" };
    return toState(query.data);
  }, [authLoading, user, query.isError, query.isPending, query.data]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrganizationContext(): OrganizationContextState {
  return useContext(OrgContext);
}

/** Organización verificada o `undefined` mientras no esté resuelta. */
export function useVerifiedOrganizationId(): string | undefined {
  const state = useOrganizationContext();
  return state.status === "ready" ? state.organizationId : undefined;
}

/** Cliente del portal verificado (usuario + empresa + cuenta activa). */
export function useVerifiedPortalCustomerId(): string | undefined {
  const state = useOrganizationContext();
  return state.status === "ready" && state.memberType === "portal" && state.customerId
    ? state.customerId
    : undefined;
}

const REASON_TEXT: Record<string, string> = {
  no_membership: "Tu cuenta todavía no está asignada a una empresa.",
  ambiguous_membership: "Tu cuenta tiene asignaciones de empresa inconsistentes.",
  // Tramo 9: la empresa fue suspendida por el operador de la plataforma.
  organization_inactive: "La empresa de tu cuenta está suspendida o no está disponible.",
  portal_account_missing: "No encontramos tu acceso de cliente en esta empresa.",
  portal_account_inactive: "Tu acceso de cliente está suspendido o cancelado.",
  portal_organization_mismatch: "Tu acceso de cliente no corresponde a esta empresa.",
};

/**
 * Bloquea el contenido protegido hasta que la empresa esté verificada.
 * `fallback` se muestra durante la verificación.
 */
export function OrganizationGate(
  { children, fallback }: { children: ReactNode; fallback?: ReactNode },
) {
  const state = useOrganizationContext();

  if (state.status === "loading" || state.status === "signed-out") {
    return <>{fallback ?? null}</>;
  }

  if (state.status === "error" || state.status === "no-membership") {
    const message = state.status === "error"
      ? "No pudimos verificar la empresa de tu cuenta. Inténtalo de nuevo en unos momentos."
      : REASON_TEXT[state.reason] ?? "Tu cuenta no tiene acceso a una empresa.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-lg font-medium">Acceso no disponible</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-xs text-muted-foreground/80">
            Solicita apoyo al administrador de tu empresa.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
