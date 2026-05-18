import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProspectForm, type ProspectFormPayload } from "@/features/crm/hooks/useProspectForm";
import { ProspectStageBadge } from "./prospect-form/ProspectStageBadge";
import { ProspectCloseDealActions } from "./prospect-form/ProspectCloseDealActions";
import { ProspectFormFields } from "./prospect-form/ProspectFormFields";
import type { Prospect } from "@/hooks/useProspects";

function buildDescription(prospect: Prospect | null | undefined, overrideStage?: string) {
  if (overrideStage && prospect) return "Confirma los datos antes de mover el prospecto de etapa.";
  if (prospect) return "Actualiza la información del prospecto.";
  return "Agrega un nuevo prospecto al pipeline.";
}

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

  const showStageBadge = Boolean(overrideStage && prospect);
  const showCreator = Boolean(prospect?.created_by_name);
  const showCloseDeal = Boolean(prospect && effectiveStage === "cerrado_ganado");
  const showDelete = Boolean(prospect && onDelete);
  const title = prospect ? "Editar Prospecto" : "Nuevo Prospecto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{buildDescription(prospect, overrideStage)}</DialogDescription>
          {showStageBadge && prospect && overrideStage && (
            <ProspectStageBadge fromStage={prospect.stage} toStage={overrideStage} />
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pb-1 pr-4">
              {showCreator && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Creado por</Label>
                  <p className="text-sm font-medium">{prospect?.created_by_name}</p>
                </div>
              )}
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
                  onClose={() => onOpenChange(false)}
                />
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex justify-between sm:justify-between pt-4">
            {showDelete && onDelete && (
              <Button type="button" variant="destructive" size="sm" onClick={() => { onDelete(); onOpenChange(false); }}>
                Eliminar
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isClosingWonBlocked}>Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
