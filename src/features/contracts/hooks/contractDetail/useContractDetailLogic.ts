import { useParams } from "react-router";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CONTRACT_STATUS_LABELS } from "../../lib/contractStatusLabels";
import { useContract, useUpdateContract } from "../useContracts";

/**
 * Centraliza el id, fetch, mutación y handler de status de la página de detalle
 * de Contrato para que el componente de página quede declarativo.
 */
export function useContractDetailLogic() {
  const { id } = useParams();
  const { data: contract, isLoading } = useContract(id);
  const updateContract = useUpdateContract();

  const setStatus = (status: string, extra?: Record<string, unknown>) => {
    if (!id) return;
    updateContract.mutate(
      { id, status, ...extra },
      { onSuccess: () => notifySuccess(`Contrato marcado como ${CONTRACT_STATUS_LABELS[status] ?? status}`) }
    );
  };

  return { id, contract, isLoading, setStatus };
}
