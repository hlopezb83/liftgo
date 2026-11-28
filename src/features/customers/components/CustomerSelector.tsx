import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasReachedListLimit, visibleListRows } from "@/lib/supabase/constants";
import { cn } from "@/lib/utils";
import { useCustomer, useCustomerSelectorSearch, type useCustomers } from "../hooks/customerQueries";
import {
  CustomerCombobox,
  ManualCustomerFields,
  type CustomerListStatus,
  type CustomerSelectorOption,
} from "./CustomerSelectorFields";

export type CustomerListQuery = Pick<ReturnType<typeof useCustomers>, "isError" | "isFetching" | "refetch">;

interface CustomerSelectorProps {
  customers: CustomerSelectorOption[] | undefined;
  customerListQuery?: CustomerListQuery;
  customerId: string;
  customerName: string;
  onCustomerIdChange: (id: string) => void;
  /** Full selection for consumers that need fields absent from the capped list. */
  onCustomerSelect?: (customer: CustomerSelectorOption) => void;
  onCustomerNameChange: (name: string) => void;
  customerContact?: string;
  onCustomerContactChange?: (contact: string) => void;
  required?: boolean;
  hideManualName?: boolean;
  helpText?: string;
  error?: string;
  /** Variante compacta para formularios densos. */
  compact?: boolean;
  /** Sin tarjeta propia: para incrustarlo dentro de otra tarjeta. */
  bare?: boolean;
}

function useSelectorSearchState(customers: CustomerSelectorOption[] | undefined) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const initialItems = useMemo(() => visibleListRows(customers), [customers]);
  const initialListTruncated = hasReachedListLimit(customers);
  const searchQuery = useCustomerSelectorSearch(searchTerm, open);
  const searchActive = searchTerm.trim().length >= 2;
  const loadingRemote = searchActive && (searchQuery.isSearchPending || searchQuery.isFetching || (!searchQuery.data && !searchQuery.isError));
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
  lastSelection: CustomerSelectorOption | undefined,
): CustomerSelectorOption | undefined {
  const selectedFromList = initialItems.find((customer) => customer.id === customerId);
  const selectedFromSearch = searchQuery.data?.customers.find((customer) => customer.id === customerId);
  const selectedInMemory = selectedFromList ?? selectedFromSearch;
  const selectedQuery = useCustomer(selectedInMemory ? undefined : customerId || undefined);
  const selectedDetail = selectedQuery.data?.id === customerId ? selectedQuery.data : undefined;
  const fallback = lastSelection?.id === customerId ? lastSelection : undefined;
  return selectedInMemory ?? selectedDetail ?? fallback;
}

function getCustomerListStatus(customers: CustomerSelectorOption[] | undefined, query?: CustomerListQuery): CustomerListStatus {
  if (query?.isError && !query.isFetching) return "error";
  return customers === undefined || query?.isError ? "loading" : "ready";
}

function getRegistrationHelp(helpText: string | undefined, customerId: string, search: ReturnType<typeof useSelectorSearchState>, listStatus: CustomerListStatus) {
  if (customerId) return undefined;
  if (!search.searchActive) return listStatus === "ready" && search.initialItems.length === 0 ? helpText : undefined;
  const { data, isError } = search.searchQuery;
  return !search.loadingRemote && !isError && !data?.isTruncated && data?.customers.length === 0 ? helpText : undefined;
}

export function CustomerSelector({
  customers,
  customerListQuery,
  customerId,
  customerName,
  onCustomerIdChange,
  onCustomerSelect,
  onCustomerNameChange,
  customerContact,
  onCustomerContactChange,
  required,
  hideManualName,
  helpText,
  error,
  compact,
  bare,
}: CustomerSelectorProps) {
  const search = useSelectorSearchState(customers);
  const [lastSelection, setLastSelection] = useState<CustomerSelectorOption>();
  const selected = useSelectedCustomer(search.initialItems, search.searchQuery, customerId, lastSelection);
  const listStatus = getCustomerListStatus(customers, customerListQuery);

  const handleSelect = (customer: CustomerSelectorOption) => {
    setLastSelection({ id: customer.id, name: customer.name, company: customer.company });
    if (onCustomerSelect) onCustomerSelect(customer);
    else onCustomerIdChange(customer.id);
    onCustomerNameChange(customer.name);
    onCustomerContactChange?.(customer.email ?? "");
    search.setSearchTerm("");
  };

  const handleClear = () => {
    setLastSelection(undefined);
    onCustomerIdChange("");
    onCustomerNameChange("");
    onCustomerContactChange?.("");
  };

  const combobox = (
          <CustomerCombobox
            items={search.items}
            selected={selected}
            customerId={customerId}
            required={required}
            compact={compact}
            helpText={getRegistrationHelp(helpText, customerId, search, listStatus)}
            listStatus={listStatus}
            onRetryList={customerListQuery && (() => { void customerListQuery.refetch(); })}
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
  );

  const showCombobox = hideManualName || search.initialItems.length > 0 || !!selected;

  if (bare) {
    return (
      <div className="space-y-2">
        {showCombobox && combobox}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <Card>
      {!compact && <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>}
      <CardContent className={cn("space-y-4", compact && "p-4")}>
        {showCombobox && combobox}
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
