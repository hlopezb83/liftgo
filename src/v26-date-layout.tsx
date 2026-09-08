import React from "react";
import { createRoot } from "react-dom/client";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { Button } from "@/components/ui/button";
import { X } from "@/components/icons";
import "@/styles.css";

const selected = new URLSearchParams(window.location.search).has("selected");
const dateRange = selected
  ? { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }
  : undefined;

function Fixture() {
  return (
    <main className="w-full p-6">
      <div data-testid="drawer-content" className="w-[272px] max-w-full border p-0">
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

createRoot(document.getElementById("root") as HTMLElement).render(<Fixture />);