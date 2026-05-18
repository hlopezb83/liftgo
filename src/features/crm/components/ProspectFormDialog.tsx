import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useProspectForm, type ProspectFormPayload } from "@/features/crm/hooks/useProspectForm";
import { ProspectCloseDealActions } from "./prospect-form/ProspectCloseDealActions";
import { ProspectFormFields } from "./prospect-form/ProspectFormFields";
import {
  ProspectDialogHeader, ProspectCreatorBlock, ProspectDialogFooter,
} from "./prospect-form/ProspectDialogParts";
import type { Prospect } from "@/features/crm/hooks/useProspects";

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

  const handleSubmit = (e: React.FormEvent) => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ProspectDialogHeader prospect={prospect} overrideStage={overrideStage} />
        <form onSubmit={handleSubmit} className="flex flex-col">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pb-1 pr-4">
              <ProspectCreatorBlock createdByName={prospect?.created_by_name} />
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
            </div>
          </ScrollArea>

          <ProspectDialogFooter
            isClosingWonBlocked={isClosingWonBlocked}
            onCancel={handleCancel}
            onDelete={prospect && onDelete ? onDelete : undefined}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
