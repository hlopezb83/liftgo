/**
 * Navegación por teclado entre columnas del Kanban de CRM.
 *
 * El `sortableKeyboardCoordinates` por defecto de dnd-kit calcula la nueva
 * posición con colisiones y, cuando la columna destino queda más allá de la
 * mitad del contenedor con scroll horizontal, el `KeyboardSensor` decide
 * *desplazar el scroll* en lugar de mover la tarjeta (ver `handleKeyDown` en
 * @dnd-kit/core). Con `scrollBehavior: "smooth"` ese desplazamiento tarda
 * cientos de ms, así que soltar la tarjeta enseguida la deja en la columna
 * original — justo el fallo que veíamos en CI con viewports angostos.
 *
 * Aquí resolvemos ArrowLeft/ArrowRight de forma determinista: saltamos al
 * borde superior izquierdo de la columna hermana. Las flechas verticales
 * siguen delegando en dnd-kit para reordenar dentro de la columna.
 */
import { KeyboardCode, type ClientRect, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** Margen interno de la columna (p-2 = 8px) para caer dentro del droppable. */
const COLUMN_PADDING = 8;

export interface ColumnRect {
  id: string;
  rect: ClientRect;
}

/**
 * Devuelve la columna vecina (izquierda o derecha) respecto de la posición
 * horizontal actual de la tarjeta arrastrada. `null` si no hay vecina.
 */
export function pickSiblingColumn(
  columns: ColumnRect[],
  currentLeft: number,
  direction: -1 | 1,
): ColumnRect | null {
  if (columns.length === 0) return null;
  const sorted = [...columns].sort((a, b) => a.rect.left - b.rect.left);

  let currentIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  sorted.forEach((column, index) => {
    const distance = Math.abs(column.rect.left - currentLeft);
    if (distance < bestDistance) {
      bestDistance = distance;
      currentIndex = index;
    }
  });

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= sorted.length) return null;
  return sorted[nextIndex];
}

/** Coordenadas destino (esquina superior izquierda) dentro de una columna. */
export function columnDropCoordinates(rect: ClientRect): { x: number; y: number } {
  return { x: rect.left + COLUMN_PADDING, y: rect.top + COLUMN_PADDING };
}

export const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const isLeft = event.code === KeyboardCode.Left;
  const isRight = event.code === KeyboardCode.Right;
  if (!isLeft && !isRight) return sortableKeyboardCoordinates(event, args);

  const { collisionRect, droppableContainers, droppableRects } = args.context;
  if (!collisionRect) return undefined;

  const columns: ColumnRect[] = [];
  droppableContainers.getEnabled().forEach((container) => {
    if (!container || container.disabled) return;
    if (container.data.current?.type !== "column") return;
    const rect = droppableRects.get(container.id) ?? container.rect.current;
    if (!rect) return;
    columns.push({ id: String(container.id), rect });
  });

  const sibling = pickSiblingColumn(columns, collisionRect.left, isRight ? 1 : -1);
  if (!sibling) return undefined;

  event.preventDefault();
  return columnDropCoordinates(sibling.rect);
};
