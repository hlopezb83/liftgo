import { SuccessIcon, ChevronsUpDown, X, CalendarIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn, formatDateRange } from "@/lib/utils";
import type { BookingWithForklift } from "@/features/bookings";

interface Props {
  bookings: BookingWithForklift[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Selector múltiple de reservas para una factura.
 * Solo permite reservas del mismo cliente: una vez elegida la primera,
 * el resto se filtra para mostrar únicamente reservas con el mismo customer_id.
 */
export function MultiBookingSelector({ bookings, selectedIds, onChange }: Props) {
  const selected = bookings.filter((b) => selectedIds.includes(b.id));
  const lockedCustomerId = selected[0]?.customer_id ?? null;

  const visibleBookings = lockedCustomerId
    ? bookings.filter((b) => b.customer_id === lockedCustomerId || selectedIds.includes(b.id))
    : bookings;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            {selectedIds.length === 0
              ? "Seleccionar reservas (opcional)"
              : `${selectedIds.length} reserva${selectedIds.length === 1 ? "" : "s"} seleccionada${selectedIds.length === 1 ? "" : "s"}`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar reserva..." />
            <CommandList>
              <CommandEmpty>Sin reservas disponibles.</CommandEmpty>
              <CommandGroup>
                {visibleBookings.map((b) => {
                  const isSelected = selectedIds.includes(b.id);
                  return (
                    <CommandItem
                      key={b.id}
                      value={`${b.forklifts?.name ?? ""} ${b.customer_name ?? ""}`}
                      onSelect={() => toggle(b.id)}
                      className="flex items-start gap-2"
                    >
                      <SuccessIcon className={cn("h-4 w-4 mt-1", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {b.forklifts?.name} — {b.customer_name || "Sin cliente"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateRange(b.start_date, b.end_date)}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((b) => (
            <Badge key={b.id} variant="secondary" className="gap-1 pr-1">
              <CalendarIcon className="h-3 w-3" />
              <span>{b.forklifts?.name} · {formatDateRange(b.start_date, b.end_date)}</span>
              <button
                type="button"
                onClick={() => remove(b.id)}
                className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5"
                aria-label="Quitar reserva"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selected.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll}>
              Limpiar
            </Button>
          )}
        </div>
      )}

      {lockedCustomerId && (
        <p className="text-xs text-muted-foreground">
          Solo se muestran reservas del mismo cliente.
        </p>
      )}
    </div>
  );
}
