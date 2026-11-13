/**
 * `useEntityMutation` — wrapper de `useMutation` que encapsula el patrón
 * repetido en toda la app: mutar en Supabase → invalidar caches → toast.
 *
 * Elimina ~8 LOC de boilerplate por mutación y evita drift entre features
 * (algunas invalidaban strings crudos, otras olvidaban toast, otras
 * duplicaban lógica de éxito).
 *
 * Los callbacks de éxito esperan la invalidación por defecto. Las mutaciones
 * con recibo confirmado pueden completar su UI mientras se actualizan lectores.
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
import { useRef } from "react";
import { translateDbError } from "@/lib/errors/dbErrors";
import { captureOperationalError } from "@/lib/observability/captureOperationalError";
import { resolveBusinessBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

export interface UseEntityMutationOptions<TVar, TData> {
  /** Función que ejecuta la mutación (llamada Supabase, RPC, etc.). Debe lanzar en error. */
  mutationFn: (vars: TVar) => Promise<TData>;
  /** Non-idempotent writes can explicitly disable retries, including client defaults. */
  retry?: false;
  /** Query keys estáticas a invalidar tras éxito. Se ejecutan en paralelo. */
  invalidateKeys?: readonly QueryKey[];
  /** Las escrituras confirmadas pueden completar su UI durante la recarga. */
  invalidationMode?: "await" | "background";
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
  /** Callback tras iniciar la invalidación y mostrar el toast de éxito. */
  onSuccess?: (data: TData, vars: TVar) => void | Promise<void>;
  /**
   * Callback custom tras error. Se ejecuta ANTES del toast estándar. Si devuelve
   * `true`, se suprime el toast por defecto (útil para reclasificar 409 benignos
   * como info en vez de error — R7 Bloque 12).
   */
  onError?: (error: Error, vars: TVar) => boolean | void;
  /**
   * Bloqueos de negocio explicables: si el error corresponde a una regla
   * catalogada en `lib/rules/businessBlocks`, se entrega aquí y se suprime el
   * toast genérico para que la UI muestre el bloque explicativo en su lugar.
   */
  onBusinessBlock?: (block: BusinessBlock, error: Error, vars: TVar) => void;
  /** Severidad del toast de error. Default `critical` (persistente). */
  errorSeverity?: "critical" | "warning";
}

export function useEntityMutation<TVar, TData>(
  options: UseEntityMutationOptions<TVar, TData>,
): UseMutationResult<TData, Error, TVar> {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    retry,
    invalidateKeys = [],
    invalidationMode = "await",
    invalidateKeysFn,
    errorTitle,
    errorMessage,
    successMsg,
    onSuccess,
    onError,
    onBusinessBlock,
    errorSeverity,
  } = options;

  const result = useMutation<TData, Error, TVar>({
    mutationFn,
    ...(retry === false ? { retry: false } : {}),
    onSuccess: async (data, vars) => {
      const dynamicKeys = invalidateKeysFn ? invalidateKeysFn(data, vars) : [];
      const allKeys = [...invalidateKeys, ...dynamicKeys];
      const invalidation = Promise.all(
        allKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
      if (invalidationMode === "background") {
        void invalidation.catch((error: unknown) => captureOperationalError(error, { phase: "query" }));
      } else {
        await invalidation;
      }
      if (successMsg) notifySuccess(successMsg);
      if (onSuccess) await onSuccess(data, vars);
    },
    onError: (error: Error, vars) => {
      // R7 Bloque 12: callback custom puede suprimir el toast estándar
      // devolviendo `true` (p.ej. reclasificar 409 "ya en proceso" como info).
      if (onError && onError(error, vars) === true) return;
      if (onBusinessBlock) {
        const block = resolveBusinessBlock(error);
        if (block) { onBusinessBlock(block, error, vars); return; }
      }
      const translated = translateDbError(error, errorTitle);
      if (translated.matched) {
        notifyError({
          title: translated.title,
          error,
          description: translated.message,
          severity: translated.severity,
        });
      } else {
        const description = typeof errorMessage === "function"
          ? errorMessage(error)
          : errorMessage;
        notifyError({
          title: errorTitle,
          error,
          description: description || undefined,
          severity: errorSeverity,
        });
      }
    },
  });

  // R7 Bloque 3 (capa 2): guarda de reentrada para `mutate` (fire-and-forget).
  // R9 Bloque 2 (capa 3): además de `target.isPending` (que sólo se ve tras el
  // flush de React), un `useRef` síncrono bloquea invocaciones que llegan en la
  // misma ventana de eventos (<25ms). El ref se libera dentro de la promesa de
  // mutación via `.then(finally)` — no dependemos de que corra el render.
  //
  // IMPORTANTE: NO envolvemos `mutateAsync`. Resolver `undefined` rompía el
  // contrato — múltiples callers hacen `const x = await m.mutateAsync(...); x.id`
  // y crasheaban silenciosamente en el segundo click. Los formularios que usan
  // `mutateAsync` ya bloquean el botón con `isPending`; si un evento se cuela,
  // preferimos que TanStack Query encole/ejecute la segunda llamada antes que
  // devolver un valor falso.
  const inFlightRef = useRef(false);
  const originalMutate = result.mutate;
  return new Proxy(result, {
    get(target, prop, receiver) {
      if (prop === "mutate") {
        return ((...args: Parameters<typeof originalMutate>) => {
          if (inFlightRef.current || target.isPending) return;
          inFlightRef.current = true;
          const [vars, opts] = args as [TVar, Parameters<typeof originalMutate>[1]?];
          return originalMutate(vars, {
            ...(opts ?? {}),
            onSettled: (data, error, v, ctx, mctx) => {
              inFlightRef.current = false;
              opts?.onSettled?.(data, error, v, ctx, mctx);
            },
          });
        }) as typeof originalMutate;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
