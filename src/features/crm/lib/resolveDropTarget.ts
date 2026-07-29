/**
 * R23-I — Resolución del destino de un drop en el Kanban de CRM.
 *
 * Se extrae de `CRMPage` para mantener el componente por debajo del límite de
 * complejidad y poder probar la regla del "soltar al final" sin montar dnd-kit.
 */
import type { DragEndEvent } from "@dnd-kit/core";

export interface DropTarget {
  draggableId: string;
  sourceStage: string;
  newStage: string;
  newIndex: number;
}

interface Column {
  key: string;
  items: { id: string }[];
}

function readStage(data: Record<string, unknown> | undefined): string | undefined {
  const stage = data?.stage;
  return typeof stage === "string" ? stage : undefined;
}

function readSortableIndex(data: Record<string, unknown> | undefined): number | undefined {
  const sortable = data?.sortable as { index?: number } | undefined;
  return typeof sortable?.index === "number" ? sortable.index : undefined;
}

export function resolveDropTarget(event: DragEndEvent, columns: Column[]): DropTarget | null {
  const { active, over } = event;
  if (!over) return null;

  const sourceStage = readStage(active.data.current);
  if (!sourceStage) return null;

  const isColumn = over.data.current?.type === "column";
  const newStage = isColumn ? String(over.id) : readStage(over.data.current) ?? String(over.id);
  if (!newStage) return null;

  const sortableIndex = readSortableIndex(over.data.current);
  if (sortableIndex !== undefined) {
    return { draggableId: String(active.id), sourceStage, newStage, newIndex: sortableIndex };
  }

  // Soltar en el área vacía de la columna: va al FINAL. Si es la misma columna,
  // la tarjeta ya está contada dentro de `items`, así que el último hueco es
  // `length - 1`.
  const columnLength = columns.find((c) => c.key === newStage)?.items.length ?? 0;
  const appendIndex =
    sourceStage === newStage ? Math.max(0, columnLength - 1) : columnLength;

  return { draggableId: String(active.id), sourceStage, newStage, newIndex: appendIndex };
}
