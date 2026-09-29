import { CloseIcon as XIcon, ChevronDownIcon, SuccessIcon as CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CustomerSelectorOption {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
}

function buildTriggerLabel(selected: CustomerSelectorOption | undefined, required?: boolean): string {
  if (selected) {
    const suffix = selected.company && selected.company !== selected.name ? " — " + selected.company : "";
    return selected.name + suffix;
  }
  return required ? "Seleccionar cliente *" : "Seleccionar cliente (opcional)";
}

function buildOptionLabel(customer: CustomerSelectorOption): string {
  return customer.company && customer.company !== customer.name
    ? customer.name + " — " + customer.company
    : customer.name;
}

function getEmptyMessage(loadingRemote: boolean, searchError: boolean, searchTruncated: boolean): string {
  if (loadingRemote) return "Buscando clientes…";
  if (searchError) return "No se pudieron cargar los resultados.";
  if (searchTruncated) return "Más de 500 coincidencias; refina la búsqueda.";
  return "Sin resultados.";
}

function filterCustomerLabel(value: string, search: string): number {
  if (!search) return 1;
  return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
}

function CustomerFieldLabel({ compact, required }: { compact?: boolean; required?: boolean }) {
  return compact ? null : <Label>{required ? "Cliente *" : "Cliente Existente"}</Label>;
}

function ClearCustomerControl({
  visible,
  onClear,
}: {
  visible: boolean;
  onClear: (e: React.MouseEvent) => void;
}) {
  if (!visible) return null;
  return (
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
  );
}

function CustomerSelectorStatus({
  helpText,
  initialListTruncated,
  searchActive,
  searchTruncated,
  searchError,
  searchTerm,
}: {
  helpText?: string;
  initialListTruncated: boolean;
  searchActive: boolean;
  searchTruncated: boolean;
  searchError: boolean;
  searchTerm: string;
}) {
  return (
    <>
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
    </>
  );
}

export function CustomerCombobox({
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
  items: CustomerSelectorOption[];
  selected: CustomerSelectorOption | undefined;
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
  onSelect: (customer: CustomerSelectorOption) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  const triggerLabel = buildTriggerLabel(selected, required);
  const emptyMessage = getEmptyMessage(loadingRemote, searchError, searchTruncated);

  return (
    <div className="space-y-1.5">
      <CustomerFieldLabel compact={compact} required={required} />
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
              <ClearCustomerControl visible={Boolean(selected) && !required} onClear={onClear} />
              <ChevronDownIcon className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start" style={{ width: "var(--radix-popover-trigger-width)" }}>
          <Command shouldFilter={!searchActive} filter={filterCustomerLabel}>
            <CommandInput
              placeholder="Buscar por nombre, razón social o RFC…"
              value={searchTerm}
              onValueChange={onSearchTermChange}
            />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {items.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={buildOptionLabel(customer)}
                    onSelect={() => {
                      onSelect(customer);
                      onOpenChange(false);
                    }}
                  >
                    <CheckIcon className={cn("mr-2 h-4 w-4", customerId === customer.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{buildOptionLabel(customer)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <CustomerSelectorStatus
        helpText={helpText}
        initialListTruncated={initialListTruncated}
        searchActive={searchActive}
        searchTruncated={searchTruncated}
        searchError={searchError}
        searchTerm={searchTerm}
      />
    </div>
  );
}

export function ManualCustomerFields({
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
  const fieldId = React.useId();
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
