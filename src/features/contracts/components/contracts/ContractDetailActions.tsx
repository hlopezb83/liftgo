import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle, XCircle, Edit } from "lucide-react";
import { ContractPDFButton, type ContractData } from "@/features/contracts/components/contracts/ContractPDFButton";

interface ContractDetailActionsProps {
  id: string;
  status: string;
  contract: ContractData;
  onSetStatus: (status: string, extra?: Record<string, unknown>) => void;
}

export function ContractDetailActions({ id, status, contract, onSetStatus }: ContractDetailActionsProps) {
  const navigate = useNavigate();
  return (
    <>
      {status === "draft" && (
        <>
          <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/${id}/edit`)}>
            <Edit className="h-4 w-4 mr-1" />Editar
          </Button>
          <Button size="sm" onClick={() => onSetStatus("sent")}>
            <Send className="h-4 w-4 mr-1" />Marcar Enviado
          </Button>
        </>
      )}
      {status === "sent" && (
        <Button size="sm" onClick={() => onSetStatus("signed", { signed_at: new Date().toISOString() })}>
          <CheckCircle className="h-4 w-4 mr-1" />Marcar Firmado
        </Button>
      )}
      {(status === "draft" || status === "sent") && (
        <Button variant="destructive" size="sm" onClick={() => onSetStatus("cancelled")}>
          <XCircle className="h-4 w-4 mr-1" />Cancelar
        </Button>
      )}
      <ContractPDFButton contract={contract} />
    </>
  );
}
