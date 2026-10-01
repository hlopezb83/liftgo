import { useState } from "react";
import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { DeliveryIcon, SignIcon, ErrorIcon, EditIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { ContractPDFButton, type ContractData } from "./ContractPDFButton";
import { ContractSignerDialog } from "./ContractSignerDialog";

interface ContractDetailActionsProps {
  id: string;
  status: string;
  contract: ContractData;
  onSetStatus: (status: string, extra?: Record<string, unknown>) => void;
  onSetSigner: (name: string) => Promise<void>;
  signerPending: boolean;
}

export function ContractDetailActions({ id, status, contract, onSetStatus, onSetSigner, signerPending }: ContractDetailActionsProps) {
  const navigate = useNavigateTransition();
  const [signerOpen, setSignerOpen] = useState(false);
  // El backend bloquea editar un contrato firmado (`enforce_signed_contract_lock`).
  // En vez de esconder la acción, se muestra deshabilitada con el motivo.
  const isLocked = status === "signed" || status === "completed";
  const hasSigner = !!contract.signed_by && contract.signed_by.trim() !== "";

  const writeActions = (
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
        hasSigner ? (
          <Button size="sm" onClick={() => onSetStatus("signed", { signed_at: new Date().toISOString() })}>
            <SignIcon className="h-4 w-4 mr-1" />Marcar Firmado
          </Button>
        ) : (
          <Button size="sm" onClick={() => setSignerOpen(true)}>
            <SignIcon className="h-4 w-4 mr-1" />Registrar firmante
          </Button>
        )
      )}

      {(status === "draft" || status === "sent") && (
        <Button variant="destructive" size="sm" onClick={() => onSetStatus("cancelled")}>
          <ErrorIcon className="h-4 w-4 mr-1" />Cancelar
        </Button>
      )}
    </>
  );

  return (
    <>
      <RoleGuard module="Contratos" minAccess="full" fallback={null}>
        {writeActions}
      </RoleGuard>
      <ContractPDFButton contract={contract} />
      <ContractSignerDialog open={signerOpen && status === "sent"} onOpenChange={setSignerOpen}
        onSave={onSetSigner} pending={signerPending} />
    </>
  );
}
