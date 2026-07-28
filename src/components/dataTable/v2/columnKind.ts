import type { ColumnAlign, ColumnKind } from "./types";

/**
 * R21 C-1: defaults por tipo semántico de columna.
 * Los callers pasan `meta: { kind: "money" }` y DataTableV2 aplica
 * alineación + font-mono/tabular-nums automáticamente.
 */
export const KIND_DEFAULTS: Record<
  ColumnKind,
  { align: ColumnAlign; className: string }
> = {
  text: { align: "left", className: "" },
  number: { align: "right", className: "font-mono tabular-nums" },
  money: { align: "right", className: "font-mono tabular-nums" },
  date: { align: "left", className: "text-muted-foreground whitespace-nowrap" },
  badge: { align: "center", className: "" },
};

export function resolveColumnKind(meta: { align?: ColumnAlign; kind?: ColumnKind } | undefined): {
  align: ColumnAlign;
  kindClassName: string;
} {
  const kind: ColumnKind = meta?.kind ?? "text";
  const def = KIND_DEFAULTS[kind];
  return { align: meta?.align ?? def.align, kindClassName: def.className };
}
