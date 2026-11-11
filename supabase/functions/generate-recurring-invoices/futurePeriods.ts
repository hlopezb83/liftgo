import { firstOfMonth, lastOfMonth, toIsoDate } from "./periods.ts";

const MAX_FUTURE_MONTHS = 24;
export type FuturePeriodOptions = {
  includeFuturePeriods?: boolean;
  futureThroughMonth?: string;
};

/** Validate even preview requests; never coerce truthy strings into permission. */
export function futurePeriodLimit(
  options: FuturePeriodOptions,
  today: Date,
): Date {
  if (
    options.includeFuturePeriods !== undefined &&
    typeof options.includeFuturePeriods !== "boolean"
  ) {
    throw new Error("includeFuturePeriods debe ser booleano");
  }
  if (options.includeFuturePeriods !== true) {
    if (options.futureThroughMonth !== undefined) {
      throw new Error("El horizonte requiere activar períodos futuros");
    }
    return today;
  }
  const month = options.futureThroughMonth;
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Indica futureThroughMonth con formato YYYY-MM");
  }
  const start = firstOfMonth(today);
  const max = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + MAX_FUTURE_MONTHS,
      1,
    ),
  );
  if (
    month < toIsoDate(start).slice(0, 7) || month > toIsoDate(max).slice(0, 7)
  ) {
    throw new Error(
      `El horizonte debe estar entre el mes actual y los próximos ${MAX_FUTURE_MONTHS} meses`,
    );
  }
  const [year, number] = month.split("-").map(Number);
  return lastOfMonth(new Date(Date.UTC(year, number - 1, 1)));
}
