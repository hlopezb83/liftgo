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

export interface BookingPickerControls {
  search: string;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
}

interface Props {
  bookings: BookingWithForklift[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Fecha de emisión de la factura — ancla el periodo facturable canónico. */
  issueDate?: Date;
  remote?: BookingPickerControls;
}

function BookingPickerPagination({ page, hasMore, isLoading, onPageChange }: BookingPickerControls) {
  if (page === 0 && !hasMore) return null;
  return (
    <div className="flex items-center justify-between border-t p-2 text-xs">
      <Button type="button" variant="ghost" size="sm" disabled={page === 0 || isLoading} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span aria-live="polite">Página {page + 1}</span>
      <Button type="button" variant="ghost" size="sm" disabled={!hasMore || isLoading} onClick={() => onPageChange(page + 1)}>
        Siguiente
      </Button>
    </div>
  );
}

function BookingPickerStatus({ remote }: { remote?: BookingPickerControls }) {
  if (remote?.isLoading) return <p role="status" className="p-3 text-sm">Cargando reservas…</p>;
  if (remote?.isError) return (
    <div role="alert" className="space-y-2 p-3 text-sm">
      <p>No se pudieron cargar las reservas.</p>
      <Button type="button" variant="outline" size="sm" onClick={remote.onRetry}>Reintentar</Button>
    </div>
  );
  return <CommandEmpty>{remote?.hasMore ? "Sin reservas disponibles en esta página." : "Sin reservas disponibles."}</CommandEmpty>;
}

function bookingBadgeLabel(booking: BookingWithForklift | undefined) {
  if (!booking) return "Reserva no disponible";
  return `${booking.booking_number ? `${booking.booking_number} · ` : ""}${booking.forklifts?.name ?? ""} · ${formatDateRange(booking.start_date, booking.end_date)}`;
}

function bookingOptionValue(booking: BookingWithForklift) {
  return `${booking.booking_number ?? ""} ${booking.forklifts?.name ?? ""} ${booking.customer_name ?? ""} ${booking.id}`;
}

function visiblePickerBookings(bookings: BookingWithForklift[], selected: BookingWithForklift[],
  selectedIds: Set<string>, lockedCustomerId: string | null, remote?: BookingPickerControls) {
  if (remote?.isLoading || remote?.isError) return selected;
  if (!lockedCustomerId) return bookings;
  return bookings.filter((booking) => booking.customer_id === lockedCustomerId || selectedIds.has(booking.id));
}

function SelectedBookingBadges({ selected, selectedIds, onChange }: {
  selected: BookingWithForklift[];
  selectedIds: string[];
  onChange: Props["onChange"];
}) {
  if (selectedIds.length === 0) return null;
  const byId = new Map(selected.map((booking) => [booking.id, booking]));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedIds.map((id) => (
        <Badge key={id} variant="secondary" className="gap-1 pr-1">
          <CalendarIcon className="h-3 w-3" />
          <span>{bookingBadgeLabel(byId.get(id))}</span>
          <button type="button" onClick={() => onChange(selectedIds.filter((candidate) => candidate !== id))}
            className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5" aria-label="Quitar reserva">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {selectedIds.length > 1 && (
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onChange([])}>
          Limpiar
        </Button>
      )}
    </div>
  );
}

/**
 * Selector múltiple de reservas para una factura.
 * Regresión v7.423.0 (P2): la factura tiene UN periodo, UNA moneda y UN tipo
 * de cambio globales, así que sólo se pueden combinar reservas del mismo
 * cliente con la misma moneda/TC y exactamente el mismo periodo facturable
 * canónico. Las incompatibles se deshabilitan con la razón visible; la misma
 * regla se re-valida al guardar (y el servidor es la autoridad final).
 */
export function MultiBookingSelector({ bookings, selectedIds, onChange, issueDate, remote }: Props) {
  const selectedIdSet = new Set(selectedIds);
  const selected = bookings.filter((b) => selectedIdSet.has(b.id));
  const lockedCustomerId = selected[0]?.customer_id ?? null;
  const anchor = selected[0] as BillableBooking | undefined;
  const issue = issueDate ?? nowMty();

  const visibleBookings = visiblePickerBookings(bookings, selected, selectedIdSet, lockedCustomerId, remote);

  const incompatibilityFor = (b: BookingWithForklift): string | null => {
    if (!anchor || selectedIdSet.has(b.id)) return null;
    return bookingIncompatibilityReason(anchor, b as BillableBooking, issue);
  };

  const toggle = (id: string) => {
    if (selectedIdSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

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
          <Command shouldFilter={!remote}>
            <CommandInput placeholder="Buscar reserva…" maxLength={remote ? 256 : undefined} value={remote?.search} onValueChange={remote?.onSearchChange} />
            <CommandList>
              <BookingPickerStatus remote={remote} />
              <CommandGroup>
                {visibleBookings.map((b) => {
                  const isSelected = selectedIdSet.has(b.id);
                  const reason = incompatibilityFor(b);
                  return (
                    <CommandItem
                      key={b.id}
                      value={bookingOptionValue(b)}
                      disabled={!!reason}
                      onSelect={() => toggle(b.id)}
                      className={cn("flex items-start gap-2", reason && "opacity-60")}
                    >
                      <SuccessIcon className={cn("h-4 w-4 mt-1", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {b.booking_number ? <span className="font-mono">{b.booking_number} · </span> : null}
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
          {remote && <BookingPickerPagination {...remote} />}
        </PopoverContent>
      </Popover>

      <SelectedBookingBadges selected={selected} selectedIds={selectedIds} onChange={onChange} />

      {lockedCustomerId && (
        <p className="text-xs text-muted-foreground">
          Sólo se combinan reservas del mismo cliente con la misma moneda, tipo
          de cambio y periodo facturable; las demás aparecen deshabilitadas.
        </p>
      )}
    </div>
  );
}
