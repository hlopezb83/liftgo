import { addDays, addMonths, isValid, startOfDay } from "date-fns";

/** El fin contratado ocupa ese día; el primer mes termina en fin + 1. */
export function allowsRecurringBilling(start: Date | undefined, end: Date | undefined): boolean {
  if (!start || !end || !isValid(start) || !isValid(end) || end < start) return false;
  return addMonths(startOfDay(start), 1) <= addDays(startOfDay(end), 1);
}
