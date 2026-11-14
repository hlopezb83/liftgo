import { FormDialog } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProspectForm, type ProspectFormPayload } from "../hooks/useProspectForm";
import { useProspectFormDelete } from "../hooks/useProspectFormDelete";
import { ProspectCloseDealActions } from "./prospect-form/ProspectCloseDealActions";
import {
  prospectDialogDescription,
  prospectDialogTitle,
} from "./prospect-form/prospectDialogCopy";
import {
  ProspectCreatorBlock,
  ProspectDialogFooter,
  ProspectStageBadgeBlock,
} from "./prospect-form/ProspectDialogParts";
import { ProspectFormFields } from "./prospect-form/ProspectFormFields";
import type { Prospect } from "../hooks/useProspects";
import type { FormEvent as ReactFormEvent } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: Prospect | null;
  defaultStage?: string;
  overrideStage?: string;
  canCloseDeal?: boolean;
  onSave: (data: ProspectFormPayload) => void | Promise<unknown>;
  onDelete?: () => void | Promise<unknown>;
  /** R12-M8: reenviado a FormDialog para bloquear Esc/click-outside y deshabilitar submit. */
  isPending?: boolean;
}

export function ProspectFormDialog({
  open, onOpenChange, prospect,
  defaultStage = "nuevo_prospecto", overrideStage,
  canCloseDeal = true, onSave, onDelete, isPending = false,
}: Props) {
  const { fields, setters, matchingQuotes, selectedQuote, quoteSelection, effectiveStage, requiresDealValue, buildPayload, isDirty } =
    useProspectForm({ prospect, open, defaultStage, overrideStage });
  const deletion = useProspectFormDelete({ open, prospectId: prospect?.id, companyName: prospect?.companyName,
    isPending, onDelete, onClose: () => onOpenChange(false) });

  // R23-B: antes se cerraba el modal sin esperar el INSERT; con latencia o
  // error de red el usuario perdía lo capturado. Ahora sólo cerramos en éxito.
  const handleSubmit = async (e: ReactFormEvent) => {
    e.preventDefault();
    if (deletion.pending) return;
    const payload = buildPayload();
    if (!payload) return;
    try {
      await onSave(payload);
      onOpenChange(false);
    } catch {
      // El toast de error lo emite la mutación; el modal permanece abierto.
    }
  };


  const isClosingWonBlocked = effectiveStage === "cerrado_ganado" && !canCloseDeal;
  const showCloseDeal = Boolean(prospect) && effectiveStage === "cerrado_ganado";
  const handleCancel = () => { if (!deletion.pending) onOpenChange(false); };

  return (
    <>
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title={prospectDialogTitle(prospect)}
      description={prospectDialogDescription(prospect, overrideStage)}
      isPending={deletion.pending || deletion.confirmation.open}
      isDirty={isDirty}
    >
      <ProspectStageBadgeBlock prospect={prospect} overrideStage={overrideStage} />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <fieldset disabled={deletion.pending} className="space-y-4">
        <ProspectCreatorBlock createdByName={prospect?.createdByName} />
        <ProspectFormFields
          fields={fields}
          setters={setters}
          matchingQuotes={matchingQuotes}
          selectedQuote={selectedQuote}
          quoteSelection={quoteSelection}
          requiresDealValue={requiresDealValue}
        />
        {showCloseDeal && prospect && (
          <ProspectCloseDealActions
            prospect={prospect}
            canCloseDeal={canCloseDeal}
            onClose={handleCancel}
          />
        )}

        <ProspectDialogFooter
          isClosingWonBlocked={isClosingWonBlocked}
          onCancel={handleCancel}
          onDelete={prospect && onDelete ? deletion.requestDelete : undefined}
          isPending={deletion.pending}
        />
        </fieldset>
      </form>
    </FormDialog>
    <ConfirmDialog {...deletion.confirmation} />
    </>
  );
}
