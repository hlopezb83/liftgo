/**
 * Tramo 9 multiempresa: estado de operador de plataforma del usuario actual,
 * sesiones, directorio de operadores y operaciones de alta/suspensión.
 *
 * Todo pasa por server functions con guard `requirePlatformOperator`; la base
 * vuelve a verificar al actor en cada RPC. Este hook sólo decide visibilidad
 * y transporta resultados; nunca es la barrera de autorización.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  getPlatformOperatorStatusFn,
  listOrganizationsFn,
  setOrganizationActiveFn,
  type PlatformOrganizationRow,
  type SetOrganizationActiveInput,
} from "../lib/platformAdmin.functions";
import {
  getPlatformSessionFn,
  listPlatformOperatorsFn,
  setPlatformOperatorProfileFn,
} from "../lib/platformOperators.functions";
import { platformKeys } from "../lib/queryKeys";
import type {
  PlatformOperatorChange,
  PlatformOperatorsInput,
} from "../lib/platformOperators.types";

/** `true` sólo si el servidor confirma que el usuario es operador activo. */
export function usePlatformOperatorStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: platformKeys.operator(user?.id),
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    meta: { silent: true },
    queryFn: async () => {
      const result = await getPlatformOperatorStatusFn();
      return result.isOperator === true;
    },
  });
}

export function usePlatformSession() {
  const { user } = useAuth();
  return useQuery({
    queryKey: platformKeys.session(user?.id),
    queryFn: () => getPlatformSessionFn(),
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    meta: { silent: true },
  });
}

export function usePlatformOperatorsList({
  scope = "operators",
  search = "",
  offset = 0,
}: PlatformOperatorsInput) {
  return useQuery({
    queryKey: platformKeys.operators.list(scope, search, offset),
    queryFn: () => listPlatformOperatorsFn({ data: { scope, search, offset } }),
    staleTime: 0,
  });
}

/**
 * Invariante de seguridad: usa `useState` + `useQueryClient` (NUNCA `useMutation`)
 * para que la contraseña de confirmación jamás entre en `variables` del `MutationCache`.
 */
export function useSetPlatformOperatorProfile() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(input: PlatformOperatorChange): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      await setPlatformOperatorProfileFn({ data: input });
      void queryClient.invalidateQueries({ queryKey: platformKeys.operators.all });
      void queryClient.invalidateQueries({ queryKey: platformKeys.audit.all });
      return true;
    } catch (failure) {
      setError(failure);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, submit };
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

export function useSetOrganizationActive() {
  return useEntityMutation<SetOrganizationActiveInput, { success: true }>({
    mutationFn: async (input) => setOrganizationActiveFn({ data: input }),
    invalidateKeys: [platformKeys.all],
    onSuccess: (_result, vars) => {
      notifySuccess(vars.active ? "Empresa reactivada" : "Empresa suspendida");
    },
    errorTitle: "No se pudo cambiar el estado de la empresa",
    errorMessage: translateError,
  });
}
