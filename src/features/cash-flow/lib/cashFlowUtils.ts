import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

export type LightColor = "red" | "amber" | "green";

export interface CashFlowItem {
  id: string;
  number: string;
  partyName: string;
  dueDate: string; // yyyy-MM-dd
  amountMxn: number;
  kind: "in" | "out";
  navigatePath: string;
}

export interface CashFlowBucket {
  index: number; // 0 = vencido, 1..N = semanas futuras
  label: string;
  rangeLabel: string;
  startDate: string | null; // null para vencido
  endDate: string | null;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
  light: LightColor;
  items: CashFlowItem[];
}

const DATE_FMT = "yyyy-MM-dd";

/** Lunes de la semana (es-MX) para una fecha. */
export function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1, locale: es });
}

export function buildWeekBuckets(today: Date, weeks: number): CashFlowBucket[] {
  const todayYmd = format(today, DATE_FMT);
  const buckets: CashFlowBucket[] = [
    {
      index: 0,
      label: "Vencido",
      rangeLabel: `Antes de ${format(today, "dd MMM", { locale: es })}`,
      startDate: null,
      endDate: todayYmd,
      inflow: 0,
      outflow: 0,
      net: 0,
      cumulative: 0,
      light: "green",
      items: [],
    },
  ];
  const firstMonday = mondayOf(today);
  for (let i = 0; i < weeks; i++) {
    const start = addDays(firstMonday, i * 7);
    const end = addDays(start, 6);
    buckets.push({
      index: i + 1,
      label: `Sem ${i + 1}`,
      rangeLabel: `${format(start, "dd MMM", { locale: es })} – ${format(end, "dd MMM", { locale: es })}`,
      startDate: format(start, DATE_FMT),
      endDate: format(end, DATE_FMT),
      inflow: 0,
      outflow: 0,
      net: 0,
      cumulative: 0,
      light: "green",
      items: [],
    });
  }
  return buckets;
}

export function findBucketIndex(buckets: CashFlowBucket[], dueDate: string, todayYmd: string): number {
  if (dueDate < todayYmd) return 0;
  for (let i = 1; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.startDate && b.endDate && dueDate >= b.startDate && dueDate <= b.endDate) return i;
  }
  return -1; // fuera del horizonte
}

export function applySemaforo(buckets: CashFlowBucket[], initial: number, safetyBuffer: number): void {
  let acc = initial;
  for (const b of buckets) {
    b.net = b.inflow - b.outflow;
    acc += b.net;
    b.cumulative = acc;
    b.light = b.cumulative < 0 ? "red" : b.cumulative < safetyBuffer ? "amber" : "green";
  }
}

export function bucketByWeek(
  items: CashFlowItem[],
  today: Date,
  weeks: number,
  initial: number,
  safetyBuffer: number,
): CashFlowBucket[] {
  const buckets = buildWeekBuckets(today, weeks);
  const todayYmd = format(today, DATE_FMT);
  for (const it of items) {
    const idx = findBucketIndex(buckets, it.dueDate, todayYmd);
    if (idx < 0) continue;
    const b = buckets[idx];
    if (it.kind === "in") b.inflow += it.amountMxn;
    else b.outflow += it.amountMxn;
    b.items.push(it);
  }
  applySemaforo(buckets, initial, safetyBuffer);
  return buckets;
}
