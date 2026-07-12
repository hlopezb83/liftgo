import { DeliveryIcon, SignIcon, ErrorIcon, EditIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { ContractPDFButton, type ContractData } from "./ContractPDFButton";

interface ContractDetailActionsProps {
  id: string;
  status: string;
  contract: ContractData;
  onSetStatus: (status: string, extra?: Record<string, unknown>) => void;
}

export function ContractDetailActions({ id, status, contract, onSetStatus }: ContractDetailActionsProps) {
  const navigate = useNavigateTransition();
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
