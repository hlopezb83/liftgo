import type { Prospect } from "../../hooks/useProspects";

export function prospectDialogTitle(prospect?: Prospect | null): string {
  return prospect ? "Editar Prospecto" : "Nuevo Prospecto";
}

export function prospectDialogDescription(prospect?: Prospect | null, overrideStage?: string): string {
  if (overrideStage && prospect) return "Confirma los datos antes de mover el prospecto de etapa.";
  return prospect ? "Actualiza la información del prospecto." : "Agrega un nuevo prospecto al pipeline.";
}
