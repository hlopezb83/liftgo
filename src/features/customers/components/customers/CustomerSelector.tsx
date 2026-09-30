import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasReachedListLimit, visibleListRows } from "@/lib/supabase/constants";
import { cn } from "@/lib/utils";
import { useCustomer, useCustomerSelectorSearch } from "../../hooks/customers/customerQueries";
import {
  CustomerCombobox,
  ManualCustomerFields,
  type CustomerSelectorOption,
} from "./CustomerSelectorFields";

interface CustomerSelectorProps {
  customers: CustomerSelectorOption[] | undefined;
  customerId: string;
  customerName: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerNameChange: (name: string) => void;
  customerContact?: string;
  onCustomerContactChange?: (contact: string) => void;
  required?: boolean;
  hideManualName?: boolean;
  helpText?: string;
  error?: string;
  /** Variante compacta para formularios densos. */
  compact?: boolean;
}

function useSelectorSearchState(customers: CustomerSelectorOption[] | undefined) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const initialItems = useMemo(() => visibleListRows(customers), [customers]);
  const initialListTruncated = hasReachedListLimit(customers);
  const searchQuery = useCustomerSelectorSearch(searchTerm, open);
  const searchActive = searchTerm.trim().length >= 2;
  const loadingRemote = searchActive && (searchQuery.isSearchPending || searchQuery.isFetching);
  const remoteItems = loadingRemote ? [] : searchQuery.data?.customers ?? [];
  const items = searchActive ? remoteItems : initialItems;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearchTerm("");
  };

  return {
    open,
    searchTerm,
    setSearchTerm,
    initialItems,
    initialListTruncated,
    searchQuery,
    searchActive,
    loadingRemote,
    items,
    handleOpenChange,
  };
}

function useSelectedCustomer(
  initialItems: CustomerSelectorOption[],
  searchQuery: ReturnType<typeof useCustomerSelectorSearch>,
  customerId: string,
): CustomerSelectorOption | undefined {
  const selectedFromList = initialItems.find((customer) => customer.id === customerId);
  const selectedFromSearch = searchQuery.data?.customers.find((customer) => customer.id === customerId);
  const selectedInMemory = selectedFromList ?? selectedFromSearch;
  const selectedQuery = useCustomer(selectedInMemory ? undefined : customerId || undefined);
  return selectedInMemory ?? selectedQuery.data ?? undefined;
}

export function CustomerSelector({
  customers,
  customerId,
  customerName,
  onCustomerIdChange,
  onCustomerNameChange,
  customerContact,
  onCustomerContactChange,
  required,
  hideManualName,
  helpText,
  error,
  compact,
}: CustomerSelectorProps) {
  const search = useSelectorSearchState(customers);
  const selected = useSelectedCustomer(search.initialItems, search.searchQuery, customerId);

  const handleSelect = (customer: CustomerSelectorOption) => {
    onCustomerIdChange(customer.id);
    onCustomerNameChange(customer.name);
    onCustomerContactChange?.(customer.email ?? "");
    search.setSearchTerm("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomerIdChange("");
    onCustomerNameChange("");
    onCustomerContactChange?.("");
  };

  return (
    <Card>
      {!compact && <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>}
      <CardContent className={cn("space-y-4", compact && "p-4")}>
        {(search.initialItems.length > 0 || selected) && (
          <CustomerCombobox
            items={search.items}
            selected={selected}
            customerId={customerId}
            required={required}
            compact={compact}
            helpText={helpText}
            initialListTruncated={search.initialListTruncated}
            searchTerm={search.searchTerm}
            searchActive={search.searchActive}
            loadingRemote={search.loadingRemote}
            searchError={search.searchQuery.isError}
            searchTruncated={search.searchQuery.data?.isTruncated ?? false}
            open={search.open}
            onOpenChange={search.handleOpenChange}
            onSearchTermChange={search.setSearchTerm}
            onSelect={handleSelect}
            onClear={handleClear}
          />
        )}
        {!hideManualName && (
          <ManualCustomerFields
            customerName={customerName}
            onCustomerNameChange={onCustomerNameChange}
            customerContact={customerContact}
            onCustomerContactChange={onCustomerContactChange}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
