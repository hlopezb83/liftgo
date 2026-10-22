import { APP_CONFIG } from "@/lib/config";
import { useLocation, useSearchParams } from "@/lib/router-compat";
import type {
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table";

/** Non-sensitive view state travels with the list URL, never selected row IDs. */
export function useTableViewState(
  rowCount?: number,
  initialSorting: SortingState = [],
) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const integer = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    const n = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
    return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : fallback;
  };
  const pagination: PaginationState = {
    pageIndex: integer("tablePage", 0, 100000),
    pageSize: Math.max(1, integer("tableSize", APP_CONFIG.PAGE_SIZE, 100)),
  };
  if (rowCount !== undefined)
    pagination.pageIndex = Math.min(
      pagination.pageIndex,
      Math.max(0, Math.ceil(rowCount / pagination.pageSize) - 1),
    );
  let sorting: SortingState = initialSorting;
  try {
    const value: unknown = JSON.parse(
      params.get("tableSort") ?? JSON.stringify(initialSorting),
    );
    if (
      Array.isArray(value) &&
      value.length <= 5 &&
      value.every(
        (s) =>
          typeof s?.id === "string" &&
          /^[\w.-]{1,100}$/.test(s.id) &&
          typeof s.desc === "boolean",
      )
    )
      sorting = value;
  } catch {
    /* Invalid or older links use the default order. */
  }
  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        change(next);
        return next;
      },
      { replace: true, expectedPathname: location.pathname },
    );
  return {
    controlledPagination: pagination,
    onControlledPaginationChange: (updater: Updater<PaginationState>) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      update((p) => {
        p.set("tablePage", String(next.pageIndex));
        p.set("tableSize", String(next.pageSize));
      });
    },
    controlledSorting: sorting,
    onControlledSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      update((p) => {
        p.set("tableSort", JSON.stringify(next));
        p.delete("tablePage");
      });
    },
  };
}
