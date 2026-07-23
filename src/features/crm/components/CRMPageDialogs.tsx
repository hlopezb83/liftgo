import { ProspectDetailSheet } from "./ProspectDetailSheet";
import { ProspectFormDialog } from "./ProspectFormDialog";
import type { useCRMPageDialogs } from "../hooks/useCRMPageDialogs";
import type { ProspectFormPayload } from "../hooks/useProspectForm";
import type { Prospect } from "../hooks/useProspects";

interface Props {
  dialogs: ReturnType<typeof useCRMPageDialogs>;
  quoteMap: Map<string, string>;
  canCloseDeal: boolean;
  assertCanClose: (kind: "save" | "create" | "move") => boolean;
  openEdit: (p: Prospect) => void;
  onCreate: (data: ProspectFormPayload) => void;
  onUpdate: (id: string, data: ProspectFormPayload) => void;
  onDelete: (id: string) => void;
  isPending?: boolean;
}

export function CRMPageDialogs({
  dialogs, quoteMap, canCloseDeal, assertCanClose, openEdit, onCreate, onUpdate, onDelete, isPending,
}: Props) {
  return (
    <>
      <ProspectDetailSheet
        prospect={dialogs.detailProspect}
        open={!!dialogs.detailProspect}
        onOpenChange={(open) => { if (!open) dialogs.setDetailProspect(null); }}
        onEdit={(p) => {
          dialogs.setDetailProspect(null);
          openEdit(p);
        }}
        quoteNumber={dialogs.detailProspect?.quoteId ? quoteMap.get(dialogs.detailProspect.quoteId) : undefined}
      />

      <ProspectFormDialog
        isPending={isPending}
        open={dialogs.dialogOpen}
        onOpenChange={(open) => {
          dialogs.setDialogOpen(open);
          if (!open) dialogs.setOverrideStage(undefined);
        }}
        prospect={dialogs.editingProspect}
        defaultStage={dialogs.defaultStage}
        overrideStage={dialogs.overrideStage}
        canCloseDeal={canCloseDeal}
        onSave={(data) => {
          if (data.stage === "cerrado_ganado" && !assertCanClose("save")) return;
          if (dialogs.editingProspect) {
            onUpdate(dialogs.editingProspect.id, data);
          } else {
            onCreate(data);
          }
        }}
        onDelete={dialogs.editingProspect ? (() => { const target = dialogs.editingProspect; if (target) onDelete(target.id); }) : undefined}
      />
    </>
  );
}
