import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { es as esRdp } from "react-day-picker/locale";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// react-day-picker v10 llama `new Intl.Locale(locale.code)` internamente en
// `getDefaultLocale` → `isRTL`. El objeto `es` re-exportado por
// `react-day-picker/locale` (vía date-fns v4) no expone un `code` BCP-47
// consumible por `Intl.Locale`, lo que lanza `RangeError: Incorrect locale
// information provided` al montar cualquier `Calendar`. Forzamos el `code`
// para restaurar el i18n sin depender de la forma interna del locale.
const esLocale = { ...esRdp, code: "es-MX" };

// Opción A: formatters custom que usan `Intl.DateTimeFormat("es-MX")` directamente
// en lugar del objeto `Locale` de date-fns. Esto silencia el console.warn
// "Incorrect locale information provided" que emiten motores estrictos
// (Chromium headless) cuando rdp v10 pasa el `Locale` a Intl internamente.
const BCP47 = "es-MX";
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmtMonthYear = new Intl.DateTimeFormat(BCP47, { month: "long", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat(BCP47, { month: "long" });
const fmtYear = new Intl.DateTimeFormat(BCP47, { year: "numeric" });
const fmtWeekday = new Intl.DateTimeFormat(BCP47, { weekday: "narrow" });
const fmtDay = new Intl.DateTimeFormat(BCP47, { day: "numeric" });

const formatters = {
  formatCaption: (date: Date) => capitalize(fmtMonthYear.format(date)),
  formatMonthCaption: (date: Date) => capitalize(fmtMonth.format(date)),
  formatYearCaption: (date: Date) => fmtYear.format(date),
  formatMonthDropdown: (date: Date) => capitalize(fmtMonth.format(date)),
  formatYearDropdown: (date: Date) => fmtYear.format(date),
  formatWeekdayName: (date: Date) => fmtWeekday.format(date),
  formatDay: (date: Date) => fmtDay.format(date),
};

export type CalendarProps = ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={esLocale}
      formatters={formatters}
      animate
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-y-4 sm:gap-x-4 sm:gap-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        ),
        range_start: "day-range-start rounded-l-md bg-primary text-primary-foreground",
        range_end: "day-range-end rounded-r-md bg-primary text-primary-foreground",
        range_middle: "bg-accent text-accent-foreground rounded-none",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
