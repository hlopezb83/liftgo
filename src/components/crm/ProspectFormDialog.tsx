import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProspectForm, type ProspectFormPayload } from "@/hooks/crm/useProspectForm";
import { ProspectStageBadge } from "./prospect-form/ProspectStageBadge";
import { ProspectCloseDealActions } from "./prospect-form/ProspectCloseDealActions";
import { ProspectFormFields } from "./prospect-form/ProspectFormFields";
import type { Prospect } from "@/hooks/useProspects";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prospect ? "Editar Prospecto" : "Nuevo Prospecto"}</DialogTitle>
          <DialogDescription>
            {overrideStage && prospect
              ? "Confirma los datos antes de mover el prospecto de etapa."
              : prospect
                ? "Actualiza la información del prospecto."
                : "Agrega un nuevo prospecto al pipeline."}
          </DialogDescription>
          {overrideStage && prospect && (
            <ProspectStageBadge fromStage={prospect.stage} toStage={overrideStage} />
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pb-1 pr-4">
              {prospect?.created_by_name && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Creado por</Label>
                  <p className="text-sm font-medium">{prospect.created_by_name}</p>
                </div>
              )}
              <ProspectFormFields
                fields={fields}
                setters={setters}
                matchingQuotes={matchingQuotes}
                selectedQuote={selectedQuote}
                requiresDealValue={requiresDealValue}
              />
              {prospect && effectiveStage === "cerrado_ganado" && (
                <ProspectCloseDealActions
                  prospect={prospect}
                  canCloseDeal={canCloseDeal}
                  onClose={() => onOpenChange(false)}
                />
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex justify-between sm:justify-between pt-4">
            {prospect && onDelete && (
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
