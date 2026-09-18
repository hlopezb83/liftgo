/**
 * Tramo 9 multiempresa: estado de operador de plataforma del usuario actual
 * y operaciones de alta/suspensión de empresas.
 *
 * Todo pasa por server functions con guard `requirePlatformOperator`; la base
 * vuelve a verificar al actor en cada RPC. Este hook sólo decide visibilidad
 * y transporta resultados; nunca es la barrera de autorización.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import {
  createOrganizationFn,
  getPlatformOperatorStatusFn,
  listOrganizationsFn,
  setOrganizationActiveFn,
  type CreateOrganizationInput,
  type CreateOrganizationResult,
  type PlatformOrganizationRow,
  type SetOrganizationActiveInput,
} from "@/lib/platformAdmin.functions";
import { notifySuccess } from "@/lib/ui/appFeedback";

export const platformKeys = {
  all: ["platform"] as const,
  operator: (userId?: string) =>
    [...platformKeys.all, "operator", userId] as const,
  organizations: () => [...platformKeys.all, "organizations"] as const,
} as const;

/** `true` sólo si el servidor confirma que el usuario es operador activo. */
export function usePlatformOperatorStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: platformKeys.operator(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const result = await getPlatformOperatorStatusFn();
      return result.isOperator === true;
    },
  });
}

export function usePlatformOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.organizations(),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformOrganizationRow[]> =>
      listOrganizationsFn(),
  });
}

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [
    /operador de plataforma|forbidden/i,
    "No tienes permisos de operador de plataforma.",
  ],
  [
    /ya existe un usuario con ese correo/i,
    "Ese correo ya está registrado con otra cuenta.",
  ],
  [/ya existe una empresa/i, "Ya existe una empresa con ese identificador."],
  [
    /no puedes suspender/i,
    "No puedes suspender la empresa a la que perteneces.",
  ],
  [
    /demasiadas peticiones|rate limit/i,
    "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  ],
];

function translateError(error: Error): string {
  const raw = error.message;
  const match = ERROR_MESSAGES.find(([re]) => re.test(raw));
  return match ? match[1] : raw;
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useEntityMutation<CreateOrganizationInput, CreateOrganizationResult>({
    mutationFn: async (input) => createOrganizationFn({ data: input }),
    invalidateKeys: [platformKeys.organizations()],
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: platformKeys.organizations() });
      notifySuccess("Empresa creada", {
        description: `Primer administrador: ${result.admin_email}`,
      });
    },
    errorTitle: "No se pudo crear la empresa",
    errorMessage: translateError,
  });
}

export function useSetOrganizationActive() {
  return useEntityMutation<SetOrganizationActiveInput, { success: true }>({
    mutationFn: async (input) => setOrganizationActiveFn({ data: input }),
    invalidateKeys: [platformKeys.organizations()],
    onSuccess: (_result, vars) => {
      notifySuccess(vars.active ? "Empresa reactivada" : "Empresa suspendida");
    },
    errorTitle: "No se pudo cambiar el estado de la empresa",
    errorMessage: translateError,
  });
}
