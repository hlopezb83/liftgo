import { createFileRoute } from "@tanstack/react-router";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { X } from "@/components/icons";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/v26-date-layout")({
  component: Fixture,
});

function Fixture() {
  const selected = new URLSearchParams(window.location.search).has("selected");
  const dateRange = selected
    ? { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }
    : undefined;

  return (
    <main className="w-full p-6">
      <div data-testid="drawer-content" className="w-[272px] max-w-full">
        <div className="flex w-full min-w-0 items-end gap-1 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-80 sm:flex-none">
            <DateRangePickerField
              label="Fecha de emisión"
              dateRange={dateRange}
              onSelect={() => undefined}
            />
          </div>
          {selected ? (
            <Button variant="ghost" size="sm" className="mb-0.5" aria-label="Quitar filtro de fecha de emisión">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}