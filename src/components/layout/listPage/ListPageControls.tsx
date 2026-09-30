import { FiltersSlot } from "./FiltersSlot";
import type { ReactNode } from "react";

interface Props {
  isMobile: boolean;
  actions?: ReactNode;
  mobileActions?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  hasActiveFilters: boolean;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
}

export function ListPageControls({
  isMobile, actions, mobileActions, search, filters,
  hasActiveFilters, filtersOpen, onFiltersOpenChange,
}: Props) {
  const filterControl = (
    <FiltersSlot
      filters={filters}
      inSheet={isMobile}
      hasActive={hasActiveFilters}
      open={filtersOpen}
      onOpenChange={onFiltersOpenChange}
    />
  );

  if (!isMobile) {
    if (!search) return filterControl;
    return <div className="flex flex-wrap items-center gap-3">{search}{filterControl}</div>;
  }
  if (!actions && !mobileActions && !search && !filters) return null;
  return (
    <div className="space-y-3">
      {(actions || mobileActions || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}{mobileActions}{filterControl}
        </div>
      )}
      {search}
    </div>
  );
}
