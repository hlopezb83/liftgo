import { useParams } from "@/lib/router-compat";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CONTRACT_STATUS_LABELS } from "../../lib/contractStatusLabels";
import { useContract, useSetSentContractSigner, useUpdateContract } from "../useContracts";

/**
 * Centraliza el id, fetch, mutación y handler de status de la página de detalle
 * de Contrato para que el componente de página quede declarativo.
 */
export function useContractDetailLogic() {
  const { id } = useParams();
  const { data: contract, isLoading, isError, refetch } = useContract(id);
  const updateContract = useUpdateContract();
  const setSentSigner = useSetSentContractSigner();

  const setStatus = (status: string, extra?: Record<string, unknown>) => {
    if (!id) return;
    updateContract.mutate(
      { id, expectedUpdatedAt: contract?.updated_at, status, ...extra },
      { onSuccess: () => notifySuccess(`Contrato marcado como ${CONTRACT_STATUS_LABELS[status] ?? status}`) }
    );
  };

  const setSigner = async (signer: string) => {
    if (!id || !contract?.updated_at) throw new Error("El contrato aún no está disponible.");
    await setSentSigner.mutateAsync({ id, expectedUpdatedAt: contract.updated_at, signer });
    notifySuccess("Firmante registrado");
  };

  return { id, contract, isLoading, isError, refetch, setStatus, setSigner, signerPending: setSentSigner.isPending };
}
