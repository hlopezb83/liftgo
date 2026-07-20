/**
 * `useEntityMutation` — wrapper de `useMutation` que encapsula el patrón
 * repetido en toda la app: mutar en Supabase → invalidar caches → toast.
 *
 * Elimina ~8 LOC de boilerplate por mutación y evita drift entre features
 * (algunas invalidaban strings crudos, otras olvidaban toast, otras
 * duplicaban lógica de éxito).
 *
 * Los `onSuccess` custom (navegación, toast personalizado, cache manual)
 * se preservan como callback opcional adicional que corre DESPUÉS de la
 * invalidación estándar.
 *
 * Ejemplo:
 *   const createContract = useEntityMutation({
 *     mutationFn: async (input: TablesInsert<"contracts">) => {
 *       const { data, error } = await supabase.from("contracts").insert(input).select().single();
 *       if (error) throw error;
 *       return data;
 *     },
 *     invalidateKeys: [contractKeys.all],
 *     successMsg: "Contrato creado",
 *     errorTitle: "Error al crear contrato",
 *   });
 */
import { useMutation, useQueryClient, type QueryKey, type UseMutationResult } from "@tanstack/react-query";
import { translateDbError } from "@/lib/errors/dbErrors";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

export interface UseEntityMutationOptions<TVar, TData> {
  /** Función que ejecuta la mutación (llamada Supabase, RPC, etc.). Debe lanzar en error. */
  mutationFn: (vars: TVar) => Promise<TData>;
  /** Query keys estáticas a invalidar tras éxito. Se ejecutan en paralelo. */
  invalidateKeys?: readonly QueryKey[];
  /**
   * Fábrica de query keys dinámicas basadas en el resultado / variables. Útil cuando
   * la key depende de un id del payload (ej: `BANK_LINES_QK(vars.bankAccountId)`).
   * Se combina con `invalidateKeys` (ambas se invalidan).
   */
  invalidateKeysFn?: (data: TData, vars: TVar) => readonly QueryKey[];
  /** Título del toast de error. Requerido para trazabilidad en logs y UX consistente. */
  errorTitle: string;
  /** Mensaje del toast de error, o función que recibe el error y devuelve el mensaje. */
  errorMessage?: string | ((error: Error) => string);
  /** Mensaje del toast de éxito. Omite para no mostrar toast. */
  successMsg?: string;
  /** Callback custom tras éxito, se ejecuta DESPUÉS de invalidar y del toast. */
  onSuccess?: (data: TData, vars: TVar) => void | Promise<void>;
  /** Severidad del toast de error. Default `critical` (persistente). */
  errorSeverity?: "critical" | "warning";
}

export function useEntityMutation<TVar, TData>(
  options: UseEntityMutationOptions<TVar, TData>,
): UseMutationResult<TData, Error, TVar> {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    invalidateKeys = [],
    invalidateKeysFn,
    errorTitle,
    successMsg,
    onSuccess,
    errorSeverity,
  } = options;

  return useMutation<TData, Error, TVar>({
    mutationFn,
    onSuccess: async (data, vars) => {
      const dynamicKeys = invalidateKeysFn ? invalidateKeysFn(data, vars) : [];
      const allKeys = [...invalidateKeys, ...dynamicKeys];
      await Promise.all(
        allKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
      if (successMsg) notifySuccess(successMsg);
      if (onSuccess) await onSuccess(data, vars);
    },
    onError: (error: Error) => {
      notifyError({ title: errorTitle, error, severity: errorSeverity });
    },
  });
}
