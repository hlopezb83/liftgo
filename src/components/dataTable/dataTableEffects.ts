import { useEffect, useRef } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import type { DataTableSelectionContext } from "./types";

export function useNotifySelection<T>(args: {
  enableRowSelection: boolean;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
}) {
  const lastNotifiedRef = useRef<string>("");
  const { enableRowSelection, onSelectionChange, selectedIds, selectedRows, clearSelection } = args;
  useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const sig = selectedIds.join("|");
    if (sig === lastNotifiedRef.current) return;
    lastNotifiedRef.current = sig;
    onSelectionChange({ selectedIds, selectedRows, clearSelection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedRows, enableRowSelection]);
}

export function usePruneRowSelection<T>(args: {
  enableRowSelection: boolean;
  tableData: T[];
  keyExtractor: (item: T, index: number) => string;
  rowSelection: RowSelectionState;
  setRowSelection: (s: RowSelectionState) => void;
}) {
  const { enableRowSelection, tableData, keyExtractor, rowSelection, setRowSelection } = args;
  useEffect(() => {
    if (!enableRowSelection) return;
    const validIds = new Set(tableData.map((row, i) => keyExtractor(row, i)));
    const next: RowSelectionState = {};
    let changed = false;
    for (const id of Object.keys(rowSelection)) {
      if (validIds.has(id) && rowSelection[id]) next[id] = true;
      else changed = true;
    }
    if (changed) setRowSelection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableData, enableRowSelection]);
}
