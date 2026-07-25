import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "@/components/icons";
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
import { cn } from "@/lib/utils";

interface Customer { id: string; name: string; company?: string | null; email?: string | null; }

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
}

/**
 * Tanda 3 P2-9: reemplaza el <Select> Radix (que montaba hasta 500 items al
 * abrir → jank visible) por un combobox `cmdk` con búsqueda incremental.
 * Mantiene la API pública intacta para no tocar los 6+ formularios que lo
 * consumen. `cmdk` virtualiza y filtra en memoria sin re-renderear la
 * pantalla que abre el popover.
 */
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
}: CustomerSelectorProps) {
  const [open, setOpen] = useState(false);

  const items = useMemo(() => customers ?? [], [customers]);
  const selected = useMemo(
    () => items.find((c) => c.id === customerId),
    [items, customerId],
  );

  const triggerLabel = selected
    ? `${selected.name}${selected.company && selected.company !== selected.name ? ` — ${selected.company}` : ""}`
    : required
      ? "Seleccionar cliente *"
      : "Seleccionar cliente (opcional)";

  const handleSelect = (id: string) => {
    onCustomerIdChange(id);
    const c = items.find((x) => x.id === id);
    if (c) {
      onCustomerNameChange(c.name);
      if (onCustomerContactChange && c.email) onCustomerContactChange(c.email);
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCustomerIdChange("");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 && (
          <div className="space-y-1.5">
            <Label>{required ? "Cliente *" : "Cliente Existente"}</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selected && "text-muted-foreground",
                  )}
                >
                  <span className="truncate text-left">{triggerLabel}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-1">
                    {selected && !required && (
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label="Limpiar cliente"
                        onClick={handleClear}
                        className="rounded-sm p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
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
                  filter={(value, search) => {
                    // `value` es el `value` que se pone en <CommandItem>: aquí
                    // el nombre + razón social del cliente. Búsqueda case-insensitive
                    // con normalización básica.
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {items.map((c) => {
                        const label = `${c.name}${c.company && c.company !== c.name ? ` — ${c.company}` : ""}`;
                        return (
                          <CommandItem
                            key={c.id}
                            value={label}
                            onSelect={() => handleSelect(c.id)}
                          >
                            <CheckIcon
                              className={cn(
                                "mr-2 h-4 w-4",
                                customerId === c.id ? "opacity-100" : "opacity-0",
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
          </div>
        )}
        {!hideManualName && (
          <div className={onCustomerContactChange ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
            <div className="space-y-1.5">
              <Label>Nombre del Cliente</Label>
              <Input value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            {onCustomerContactChange && (
              <div className="space-y-1.5">
                <Label>Contacto</Label>
                <Input placeholder="Correo o teléfono" value={customerContact || ""} onChange={(e) => onCustomerContactChange(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
