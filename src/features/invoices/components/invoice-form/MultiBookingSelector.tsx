import { SuccessIcon, ChevronsUpDown, X, CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BookingWithForklift } from "@/features/bookings";
import { cn, formatDateRange, nowMty } from "@/lib/utils";
import { bookingIncompatibilityReason, type BillableBooking } from "../../lib/bookingCompatibility";

interface Props {
  bookings: BookingWithForklift[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Fecha de emisión de la factura — ancla el periodo facturable canónico. */
  issueDate?: Date;
}

/**
 * Selector múltiple de reservas para una factura.
 * Regresión v7.423.0 (P2): la factura tiene UN periodo, UNA moneda y UN tipo
 * de cambio globales, así que sólo se pueden combinar reservas del mismo
 * cliente con la misma moneda/TC y exactamente el mismo periodo facturable
 * canónico. Las incompatibles se deshabilitan con la razón visible; la misma
 * regla se re-valida al guardar (y el servidor es la autoridad final).
 */
export function MultiBookingSelector({ bookings, selectedIds, onChange, issueDate }: Props) {
  const selected = bookings.filter((b) => selectedIds.includes(b.id));
  const lockedCustomerId = selected[0]?.customer_id ?? null;
  const anchor = selected[0] as BillableBooking | undefined;
  const issue = issueDate ?? nowMty();

  const visibleBookings = lockedCustomerId
    ? bookings.filter((b) => b.customer_id === lockedCustomerId || selectedIds.includes(b.id))
    : bookings;

  const incompatibilityFor = (b: BookingWithForklift): string | null => {
    if (!anchor || selectedIds.includes(b.id)) return null;
    return bookingIncompatibilityReason(anchor, b as BillableBooking, issue);
  };

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
            <CommandInput placeholder="Buscar reserva…" />
            <CommandList>
              <CommandEmpty>Sin reservas disponibles.</CommandEmpty>
              <CommandGroup>
                {visibleBookings.map((b) => {
                  const isSelected = selectedIds.includes(b.id);
                  const reason = incompatibilityFor(b);
                  return (
                    <CommandItem
                      key={b.id}
                      value={`${b.forklifts?.name ?? ""} ${b.customer_name ?? ""}`}
                      disabled={!!reason}
                      onSelect={() => toggle(b.id)}
                      className={cn("flex items-start gap-2", reason && "opacity-60")}
                    >
                      <SuccessIcon className={cn("h-4 w-4 mt-1", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {b.forklifts?.name} — {b.customer_name || "Sin cliente"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateRange(b.start_date, b.end_date)}
                        </span>
                        {reason && (
                          <span className="text-xs text-muted-foreground">
                            No combinable: {reason}
                          </span>
                        )}
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
          Sólo se combinan reservas del mismo cliente con la misma moneda, tipo
          de cambio y periodo facturable; las demás aparecen deshabilitadas.
        </p>
      )}
    </div>
  );
}
