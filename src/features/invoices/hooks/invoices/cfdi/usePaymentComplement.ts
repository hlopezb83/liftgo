import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { satStatusLabel } from "@/features/feedback";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
import { isPacPending } from "../../../lib/pacPending";
import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";

export function useStampPaymentComplement() {
  const queryClient = useQueryClient();
  const blockedRef = useRef<ReadonlySet<string>>(new Set());
  const [retryBlockedPaymentIds, setRetryBlockedPaymentIds] = useState<ReadonlySet<string>>(() => new Set());
  const setRetryBlocked = (paymentId: string, blocked: boolean) => {
    const next = new Set(blockedRef.current);
    if (blocked) next.add(paymentId);
    else next.delete(paymentId);
    blockedRef.current = next;
    setRetryBlockedPaymentIds(next);
  };
  const mutation = useEntityMutation({
    mutationFn: async (paymentId: string) => {
      if (blockedRef.current.has(paymentId)) {
        throw new Error("No se pudo confirmar el estado del REP. Recarga los pagos antes de reintentar.");
      }
      try {
        return await invokeEdgeFunction("stamp-payment-complement", {
          body: { payment_id: paymentId },
        });
      } catch (error) {
        // Keep isPending until the server state replaces any cached none/pending
        // row. A failed/missing read blocks this action locally, without
        // inventing a persisted REP state or releasing an uncertain claim.
        setRetryBlocked(paymentId, true);
        try {
          await queryClient.invalidateQueries(
            { queryKey: paymentKeys.all, refetchType: "all" },
            { throwOnError: true },
          );
          const refreshed = queryClient.getQueryCache().findAll({ queryKey: paymentKeys.all }).some((query) => {
            const { data, status, isInvalidated } = query.state;
            return status === "success" && !isInvalidated && Array.isArray(data) &&
              data.some((row: unknown) => row && typeof row === "object" && "id" in row && row.id === paymentId);
          });
          if (refreshed) setRetryBlocked(paymentId, false);
        } catch {
          // Preserve the original stamping error. The disabled action explains
          // that the operator must reload before attempting another emission.
        }
        throw error;
      }
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    successMsg: "Complemento de pago timbrado",
    errorTitle: "No se pudo timbrar el complemento de pago",
    onError: (error) => {
      if (!isPacPending(error)) return;
      notifyInfo("Solicitud de timbrado recibida. El complemento sigue pendiente; consulta su estado para confirmar el resultado.");
      return true;
    },
  });
  return { ...mutation, retryBlockedPaymentIds };
}

export function useCancelPaymentComplement() {
  return useEntityMutation({
    mutationFn: async ({ paymentId, motive }: { paymentId: string; motive: string }) => {
      return await invokeEdgeFunction<{ cancellation_status?: string }>("cancel-payment-complement", {
        body: { payment_id: paymentId, motive },
      });
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "No se pudo cancelar el complemento de pago",
    onSuccess: (data) => {
      if (data?.cancellation_status === "accepted") {
        notifySuccess("Complemento de pago cancelado");
      } else {
        notifyInfo(satStatusLabel(data?.cancellation_status));
      }
    },
  });
}
