/**
 * B-11 — Kanban optimista.
 *
 * Reductor puro que aplica el movimiento de una tarjeta entre columnas del
 * Kanban de CRM: reasigna `stage` y recalcula `stageOrder` de la columna
 * origen y destino. Se usa tanto en el `onMutate` optimista como en las
 * pruebas unitarias, sin tocar red ni caché.
 */
import type { Prospect } from "./prospectTypes";

export interface StageMove {
  id: string;
  newStage: string;
  newIndex: number;
}

function reindex(items: Prospect[]): Prospect[] {
  return items.map((p, i) => (p.stageOrder === i ? p : { ...p, stageOrder: i }));
}

export function applyStageMove(prospects: Prospect[], move: StageMove): Prospect[] {
  const moved = prospects.find((p) => p.id === move.id);
  if (!moved) return prospects;

  const rest = prospects.filter((p) => p.id !== move.id);
  const target = rest
    .filter((p) => p.stage === move.newStage)
    .sort((a, b) => a.stageOrder - b.stageOrder);
  const source = rest
    .filter((p) => p.stage === moved.stage && moved.stage !== move.newStage)
    .sort((a, b) => a.stageOrder - b.stageOrder);

  const index = Math.max(0, Math.min(move.newIndex, target.length));
  target.splice(index, 0, { ...moved, stage: move.newStage });

  const updated = new Map<string, Prospect>();
  reindex(target).forEach((p) => updated.set(p.id, p));
  reindex(source).forEach((p) => updated.set(p.id, p));

  return prospects.map((p) => updated.get(p.id) ?? p);
}
