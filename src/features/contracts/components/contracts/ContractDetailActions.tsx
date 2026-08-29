import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { DeliveryIcon, SignIcon, ErrorIcon, EditIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { ContractPDFButton, type ContractData } from "./ContractPDFButton";

interface ContractDetailActionsProps {
  id: string;
  status: string;
  contract: ContractData;
  onSetStatus: (status: string, extra?: Record<string, unknown>) => void;
}

export function ContractDetailActions({ id, status, contract, onSetStatus }: ContractDetailActionsProps) {
  const navigate = useNavigateTransition();
  // El backend bloquea editar un contrato firmado (`enforce_signed_contract_lock`).
  // En vez de esconder la acción, se muestra deshabilitada con el motivo.
  const isLocked = status === "signed" || status === "completed";
  return (
    <>
      {status === "draft" && (
        <>
          <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/${id}/edit`)}>
            <EditIcon className="h-4 w-4 mr-1" />Editar
          </Button>
          <Button size="sm" onClick={() => onSetStatus("sent")}>
            <DeliveryIcon className="h-4 w-4 mr-1" />Marcar Enviado
          </Button>
        </>
      )}
      {isLocked && (
        <BlockedActionButton
          variant="outline"
          size="sm"
          block={describeBusinessBlock("contract_signed_locked")}
          onClick={() => navigate(`/contracts/${id}/edit`)}
        >
          <EditIcon className="h-4 w-4 mr-1" />Editar
        </BlockedActionButton>
      )}
      {status === "sent" && (
        <Button size="sm" onClick={() => onSetStatus("signed", { signed_at: new Date().toISOString() })}>
          <SignIcon className="h-4 w-4 mr-1" />Marcar Firmado
        </Button>
      )}
      {(status === "draft" || status === "sent") && (
        <Button variant="destructive" size="sm" onClick={() => onSetStatus("cancelled")}>
          <ErrorIcon className="h-4 w-4 mr-1" />Cancelar
        </Button>
      )}
      <ContractPDFButton contract={contract} />
    </>
  );
}
