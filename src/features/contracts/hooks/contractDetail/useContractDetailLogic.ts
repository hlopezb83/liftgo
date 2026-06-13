import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/constants";
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
      { onSuccess: () => toast.success(`Contrato marcado como ${STATUS_LABELS[status] ?? status}`) }
    );
  };

  return { id, contract, isLoading, setStatus };
}
