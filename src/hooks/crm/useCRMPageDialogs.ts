import { useState } from "react";
import type { Prospect } from "@/hooks/useProspects";

export function useCRMPageDialogs() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);
  const [defaultStage, setDefaultStage] = useState("nuevo_prospecto");
  const [overrideStage, setOverrideStage] = useState<string | undefined>(undefined);

  const closeDialog = () => {
    setDialogOpen(false);
    setOverrideStage(undefined);
  };

  return {
    dialogOpen, setDialogOpen,
    editingProspect, setEditingProspect,
    detailProspect, setDetailProspect,
    defaultStage, setDefaultStage,
    overrideStage, setOverrideStage,
    closeDialog,
  };
}
