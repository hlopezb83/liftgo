import { FormDialog } from "@/components/forms/FormDialog";
import { useProspectForm, type ProspectFormPayload } from "../hooks/useProspectForm";
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
  onSave: (data: ProspectFormPayload) => void;
  onDelete?: () => void;
}

export function ProspectFormDialog({
  open, onOpenChange, prospect,
  defaultStage = "nuevo_prospecto", overrideStage,
  canCloseDeal = true, onSave, onDelete,
}: Props) {
  const { fields, setters, matchingQuotes, selectedQuote, effectiveStage, requiresDealValue, buildPayload } =
    useProspectForm({ prospect, open, defaultStage, overrideStage });

  const handleSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    onSave(payload);
    onOpenChange(false);
  };

  const isClosingWonBlocked = effectiveStage === "cerrado_ganado" && !canCloseDeal;
  const showCloseDeal = Boolean(prospect) && effectiveStage === "cerrado_ganado";
  const handleCancel = () => onOpenChange(false);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title={prospectDialogTitle(prospect)}
      description={prospectDialogDescription(prospect, overrideStage)}
    >
      <ProspectStageBadgeBlock prospect={prospect} overrideStage={overrideStage} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <ProspectCreatorBlock createdByName={prospect?.createdByName} />
        <ProspectFormFields
          fields={fields}
          setters={setters}
          matchingQuotes={matchingQuotes}
          selectedQuote={selectedQuote}
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
          onDelete={prospect && onDelete ? onDelete : undefined}
        />
      </form>
    </FormDialog>
  );
}
