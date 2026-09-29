import { useId, useMemo, useState } from "react";
import { CloseIcon as XIcon, ChevronDownIcon, SuccessIcon as CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hasReachedListLimit, visibleListRows } from "@/lib/supabase/constants";
import { cn } from "@/lib/utils";
import { useCustomer, useCustomerSelectorSearch } from "../../hooks/customers/customerQueries";

interface Customer {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
}

interface CustomerSelectorProps {
  customers: Customer[] | undefined;
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
  /**
   * V26-07: variante compacta (usada en Nueva cotización). Quita el encabezado
   * redundante y la etiqueta duplicada del combobox, y reduce el padding.
   * No cambia comportamiento, validaciones ni el nombre accesible del control.
   */
  compact?: boolean;
}

/** Tanda 3 P2-9: combobox cmdk para mantener fluida la selección de clientes. */
function buildTriggerLabel(
  selected: Customer | undefined,
  required: boolean | undefined,
): string {
  if (selected) {
    const suffix = selected.company && selected.company !== selected.name
      ? " — " + selected.company
      : "";
    return selected.name + suffix;
  }
  return required ? "Seleccionar cliente *" : "Seleccionar cliente (opcional)";
}

function CustomerCombobox({
  items,
  selected,
  customerId,
  required,
  compact,
  helpText,
  initialListTruncated,
  searchTerm,
  searchActive,
  loadingRemote,
  searchError,
  searchTruncated,
  open,
  onOpenChange,
  onSearchTermChange,
  onSelect,
  onClear,
}: {
  items: Customer[];
  selected: Customer | undefined;
  customerId: string;
  required?: boolean;
  compact?: boolean;
  helpText?: string;
  initialListTruncated: boolean;
  searchTerm: string;
  searchActive: boolean;
  loadingRemote: boolean;
  searchError: boolean;
  searchTruncated: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchTermChange: (value: string) => void;
  onSelect: (customer: Customer) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  const triggerLabel = buildTriggerLabel(selected, required);
  const emptyMessage = loadingRemote
    ? "Buscando clientes…"
    : searchError
      ? "No se pudieron cargar los resultados."
      : searchTruncated
        ? "Más de 500 coincidencias; refina la búsqueda."
        : "Sin resultados.";

  return (
    <div className="space-y-1.5">
      {compact ? null : <Label>{required ? "Cliente *" : "Cliente Existente"}</Label>}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={"Cliente" + (required ? " (obligatorio): " : ": ") + triggerLabel}
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {selected && !required && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Limpiar cliente"
                  onClick={onClear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onClear(e as unknown as React.MouseEvent);
                  }}
                  className="rounded-sm p-0.5 opacity-60 hover:bg-muted hover:opacity-100 cursor-pointer"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronDownIcon className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          align="start"
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <Command
            shouldFilter={!searchActive}
            filter={(value, search) => {
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput
              placeholder="Buscar por nombre, razón social o RFC…"
              value={searchTerm}
              onValueChange={onSearchTermChange}
            />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {items.map((customer) => {
                  const label = customer.company && customer.company !== customer.name
                    ? customer.name + " — " + customer.company
                    : customer.name;
                  return (
                    <CommandItem
                      key={customer.id}
                      value={label}
                      onSelect={() => {
                        onSelect(customer);
                        onOpenChange(false);
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          customerId === customer.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helpText && <p className="text-sm text-muted-foreground">{helpText}</p>}
      {initialListTruncated && (
        <p className="text-sm text-muted-foreground">
          Hay más clientes en la cartera. Busca por nombre, razón social o RFC para encontrarlos.
        </p>
      )}
      {searchActive && searchTruncated && (
        <p role="status" className="text-sm text-muted-foreground">
          Se encontraron más de 500 coincidencias. Refina la búsqueda para ver resultados específicos.
        </p>
      )}
      {searchActive && searchError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo completar la búsqueda. Inténtalo de nuevo.
        </p>
      )}
      {initialListTruncated && searchTerm.trim().length === 1 && (
        <p className="text-sm text-muted-foreground">
          Escribe al menos 2 caracteres para buscar en toda la cartera.
        </p>
      )}
    </div>
  );
}

/** Captura manual de nombre y contacto cuando no se elige un cliente del catálogo. */
function ManualCustomerFields({
  customerName,
  onCustomerNameChange,
  customerContact,
  onCustomerContactChange,
}: {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  customerContact?: string;
  onCustomerContactChange?: (contact: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className={onCustomerContactChange ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
      <div className="space-y-1.5">
        <Label htmlFor={fieldId + "-name"}>Nombre del Cliente</Label>
        <Input id={fieldId + "-name"} value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} placeholder="Nombre del cliente" />
      </div>
      {onCustomerContactChange && (
        <div className="space-y-1.5">
          <Label htmlFor={fieldId + "-contact"}>Contacto</Label>
          <Input id={fieldId + "-contact"} placeholder="Correo o teléfono" value={customerContact || ""} onChange={(e) => onCustomerContactChange(e.target.value)} />
        </div>
      )}
    </div>
  );
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
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const initialItems = useMemo(() => visibleListRows(customers), [customers]);
  const initialListTruncated = hasReachedListLimit(customers);
  const searchQuery = useCustomerSelectorSearch(searchTerm, open);
  const searchActive = searchTerm.trim().length >= 2;
  const loadingRemote = searchActive && (searchQuery.isSearchPending || searchQuery.isFetching);
  const remoteItems = loadingRemote ? [] : searchQuery.data?.customers ?? [];
  const items = searchActive ? remoteItems : initialItems;
  const selectedFromList = initialItems.find((customer) => customer.id === customerId);
  const selectedFromSearch = searchQuery.data?.customers.find((customer) => customer.id === customerId);
  const selectedInMemory = selectedFromList ?? selectedFromSearch;
  const selectedQuery = useCustomer(selectedInMemory ? undefined : customerId || undefined);
  const selected = selectedInMemory ?? selectedQuery.data ?? undefined;

  const handleSelect = (customer: Customer) => {
    onCustomerIdChange(customer.id);
    onCustomerNameChange(customer.name);
    if (onCustomerContactChange && customer.email) onCustomerContactChange(customer.email);
    setSearchTerm("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearchTerm("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomerIdChange("");
  };

  return (
    <Card>
      {!compact && <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>}
      <CardContent className={cn("space-y-4", compact && "p-4")}>
        {(initialItems.length > 0 || selected) && (
          <CustomerCombobox
            items={items}
            selected={selected}
            customerId={customerId}
            required={required}
            compact={compact}
            helpText={helpText}
            initialListTruncated={initialListTruncated}
            searchTerm={searchTerm}
            searchActive={searchActive}
            loadingRemote={loadingRemote}
            searchError={searchQuery.isError}
            searchTruncated={searchQuery.data?.isTruncated ?? false}
            open={open}
            onOpenChange={handleOpenChange}
            onSearchTermChange={setSearchTerm}
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
