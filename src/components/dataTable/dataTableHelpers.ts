import type { Row, SortingState } from "@tanstack/react-table";

export function cycleSorting(prev: SortingState, key: string): SortingState {
  const cur = prev[0];
  if (!cur || cur.id !== key) return [{ id: key, desc: false }];
  if (!cur.desc) return [{ id: key, desc: true }];
  return [{ id: key, desc: false }];
}

export function computeHeaderCheckedState<T>(
  enableRowSelection: boolean,
  rows: Row<T>[],
): { headerCheckedState: boolean | "indeterminate" } {
  if (!enableRowSelection) return { headerCheckedState: false };
  const selectable = rows.filter((r) => r.getCanSelect());
  if (selectable.length === 0) return { headerCheckedState: false };
  const all = selectable.every((r) => r.getIsSelected());
  if (all) return { headerCheckedState: true };
  const some = selectable.some((r) => r.getIsSelected());
  return { headerCheckedState: some ? "indeterminate" : false };
}
