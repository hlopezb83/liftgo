import { ProspectDetailSheet } from "@/features/crm/components/ProspectDetailSheet";
import { ProspectFormDialog } from "@/features/crm/components/ProspectFormDialog";
import type { useCRMPageDialogs } from "@/features/crm/hooks/useCRMPageDialogs";
import type { Prospect } from "@/features/crm/hooks/useProspects";
import type { ProspectFormPayload } from "@/features/crm/hooks/useProspectForm";

interface Props {
  dialogs: ReturnType<typeof useCRMPageDialogs>;
  quoteMap: Map<string, string>;
  canCloseDeal: boolean;
  assertCanClose: (kind: "save" | "create" | "move") => boolean;
  openEdit: (p: Prospect) => void;
  onCreate: (data: ProspectFormPayload) => void;
  onUpdate: (id: string, data: ProspectFormPayload) => void;
  onDelete: (id: string) => void;
}

export function CRMPageDialogs({
  dialogs, quoteMap, canCloseDeal, assertCanClose, openEdit, onCreate, onUpdate, onDelete,
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
        quoteNumber={dialogs.detailProspect?.quote_id ? quoteMap.get(dialogs.detailProspect.quote_id) : undefined}
      />

      <ProspectFormDialog
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
