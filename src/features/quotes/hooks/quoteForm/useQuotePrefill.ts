import { useState } from "react";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseDateLocal } from "@/lib/utils";
import { EMPTY_RENTAL_LINE, EMPTY_SALE_LINE } from "./useQuoteForm";
import type { QuoteFormValues, RentalLineValues, SaleLineValues } from "../../lib/quoteFormSchema";

export type EquipmentModel = {
  id: string; manufacturer: string; model: string;
  default_daily_rate?: number | null; default_weekly_rate?: number | null; default_monthly_rate?: number | null;
};

export type ExistingQuote = {
  id?: string;
  quote_type?: string; customer_id?: string | null; customer_name?: string | null;
  start_date?: string | null; end_date?: string | null;
  tax_rate: number | string; currency?: string; tipo_cambio?: number | string | null; notes?: string | null;
  valid_until?: string | null; line_items?: unknown; rental_meta?: unknown;
};

const matchModel = (item: LineItem, models: EquipmentModel[]) =>
  models.find((m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model));

/** Servicios adicionales que se capturan como casilla + monto, no como partida libre. */
const isLogisticsLine = (item: LineItem) => !!item.description?.includes("Logística");
const isInsuranceLine = (item: LineItem) => /seguro/i.test(item.description ?? "");

function extractExtra(items: LineItem[], match: (item: LineItem) => boolean): { include: boolean; cost: number } {
  const found = items.find(match);
  if (!found) return { include: false, cost: 0 };
  return { include: true, cost: found.unit_price || found.total || 0 };
}

function rebuildSaleLines(items: LineItem[], models: EquipmentModel[]): SaleLineValues[] {
  if (items.length === 0) return [{ ...EMPTY_SALE_LINE }];
  return items.map((item) => {
    const found = matchModel(item, models);
    return {
      modelId: found?.id || "",
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      discount: item.discount || 0,
      discountType: (item.discount_type || "%") as "%" | "$",
    };
  });
}

function lineToRentalLine(item: LineItem, found: EquipmentModel, rentalDays?: number): RentalLineValues {
  // A1-6: preservar cantidad/tarifa pactadas de la cotización guardada; el
  // catálogo sólo es fallback cuando la partida no trae el dato (legacy sin
  // `unit_price`). Antes se colapsaba `quantity` a 1 y se sustituían las
  // tarifas acordadas por las del catálogo al re-editar, mostrando montos
  // distintos a los originalmente cotizados.
  const unitPrice = Number(item.unit_price ?? item.total) || 0;
  // A1-6: respetar la periodicidad de la partida (rate_type / descripción).
  // Antes toda tarifa se colocaba en `dailyRate`, inflando totales mensuales.
  const field = rentalRateField(item.description, item, rentalDays);
  const rate = unitPrice > 0 ? unitPrice : found.default_daily_rate ?? 0;
  return {
    modelId: found.id,
    quantity: Number(item.quantity ?? legacyQty(item)) || 1,
    dailyRate: field === "dailyRate" ? rate : found.default_daily_rate ?? 0,
    weeklyRate: field === "weeklyRate" ? rate : found.default_weekly_rate ?? 0,
    monthlyRate: field === "monthlyRate" ? rate : found.default_monthly_rate ?? 0,
    discount: item.discount || 0,
    discountType: (item.discount_type || "%") as "%" | "$",
  };
}


/**
 * R9VTA-04: fallback para cotizaciones legacy sin `rental_meta` cuyas
 * partidas usan una descripción libre ("Renta montacargas") que no casa con
 * ningún modelo del catálogo (`matchModel` requiere fabricante + modelo
 * exactos). En vez de descartar la partida (línea vacía => totales $0.00),
 * conservamos cantidad/tarifa/descuento históricos con `modelId: ""` para
 * que el usuario sólo tenga que re-seleccionar el modelo.
 */
/** Lee `qty` en partidas legacy (el tipo LineItem sólo declara `quantity`). */
function legacyQty(item: LineItem): number | undefined {
  const raw = (item as unknown as Record<string, unknown>).qty;
  return typeof raw === "number" || typeof raw === "string" ? Number(raw) : undefined;
}

/**
 * R10-FE-03b: la descripción legacy indica la periodicidad de la tarifa
 * ("… — Renta mensual"). Colocar un importe mensual en `dailyRate` lo
 * multiplica por los días del periodo y reproduce el total fantasma
 * ($20,000/mes → $640,000).
 *
 * R12-FE-01 (P1 r11): sin pista textual, si la partida tiene un solo cargo
 * (`unit_price == total`) y el periodo es de 28 días o más, el importe es
 * casi seguro mensual (COT-0001 / COT-0005). En cualquier otro caso se
 * mantiene el comportamiento previo (diaria).
 */
type RentalRateField = "dailyRate" | "weeklyRate" | "monthlyRate";

/**
 * M-10: lee el `rate_type` explícito persistido en la partida (line_items).
 * Cuando existe, es la fuente de verdad y evita la heurística legacy.
 * Las partidas históricas (sin `rate_type`) siguen usando el fallback.
 */
function explicitRateField(item?: { rate_type?: unknown } | null): RentalRateField | undefined {
  const rt = item?.rate_type;
  if (rt === "daily" || rt === "dailyRate") return "dailyRate";
  if (rt === "weekly" || rt === "weeklyRate") return "weeklyRate";
  if (rt === "monthly" || rt === "monthlyRate") return "monthlyRate";
  return undefined;
}

export function rentalRateField(
  description?: string | null,
  item?: { unit_price?: number | null; total?: number | null; rate_type?: unknown },
  rentalDays?: number,
): RentalRateField {
  // M-10: `rate_type` explícito tiene prioridad sobre las heurísticas.
  const explicit = explicitRateField(item);
  if (explicit) return explicit;
  const d = (description ?? "").toLowerCase();
  if (d.includes("mensual") || d.includes("/mes")) return "monthlyRate";
  if (d.includes("semanal") || d.includes("/semana")) return "weeklyRate";

  const unit = item?.unit_price;
  const total = item?.total;
  if (
    unit != null && total != null &&
    Number(unit) === Number(total) &&
    (rentalDays ?? 0) >= 28
  ) {
    return "monthlyRate";
  }
  return "dailyRate";
}

function lineToRentalLineFallback(item: LineItem, rentalDays?: number): RentalLineValues {
  // R10-FE-03 (P1): NO sintetizar la tarifa desde `total` (importe de la
  // partida): al multiplicarse por los días de renta genera totales fantasma.
  const rate = Number(item.unit_price) || 0;
  const field = rentalRateField(item.description, item, rentalDays);
  return {
    modelId: "",
    // R10-FE-03 (P1): cotizaciones legacy usan `qty` (no `quantity`).
    quantity: Number(item.quantity ?? legacyQty(item)) || 1,
    dailyRate: field === "dailyRate" ? rate : 0,
    weeklyRate: field === "weeklyRate" ? rate : 0,
    monthlyRate: field === "monthlyRate" ? rate : 0,
    discount: item.discount || 0,
    discountType: (item.discount_type || "%") as "%" | "$",
    // R13-FE-01 (P1): importe histórico acordado; se usa tal cual mientras la
    // partida no tenga modelo (recalcular tarifa x periodo lo corrompe).
    legacyTotal: Number(item.unit_price ?? item.total) || undefined,
    legacyDescription: item.description ?? undefined,
  };
}

/** Días del periodo cotizado (mínimo 1) para inferir la periodicidad legacy. */
export function quoteRentalDays(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 0;
  const from = parseDateLocal(startDate);
  const to = parseDateLocal(endDate);
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}



/** Tarifas con defaults (extraído para mantener la complejidad bajo el umbral). */
function normalizeRates(raw: Partial<RentalLineValues> | undefined) {
  return {
    dailyRate: raw?.dailyRate ?? 0,
    weeklyRate: raw?.weeklyRate ?? 0,
    monthlyRate: raw?.monthlyRate ?? 0,
    // R-M11: cotizaciones legacy pueden traer `rental_meta` sin `discount`
    // ni `discountType`. Sin defaults, el zod resolver rechaza el submit.
    discount: raw?.discount ?? 0,
    discountType: (raw?.discountType ?? "%") as "%" | "$",
  };
}

function normalizeRentalLine(raw: Partial<RentalLineValues> | undefined): RentalLineValues {
  return {
    modelId: raw?.modelId ?? "",
    quantity: raw?.quantity ?? 1,
    ...normalizeRates(raw),
    // R13-FE-01: sobreviven el round-trip por `rental_meta`.
    legacyTotal: raw?.legacyTotal,
    legacyDescription: raw?.legacyDescription,
  };
}

function getRentalMeta(q: ExistingQuote, items: LineItem[]): RentalLineValues[] | undefined {
  const direct = q.rental_meta as Array<Partial<RentalLineValues>> | undefined;
  if (direct && direct.length > 0) return direct.map(normalizeRentalLine);
  const firstItem = (items as Array<LineItem & { _rentalMeta?: Array<Partial<RentalLineValues>> }>)?.[0];
  return firstItem?._rentalMeta?.map(normalizeRentalLine);
}

function rebuildRentalLines(items: LineItem[], q: ExistingQuote, models: EquipmentModel[]): RentalLineValues[] {
  const meta = getRentalMeta(q, items);
  if (meta && meta.length > 0) return meta;
  if (items.length === 0) return [{ ...EMPTY_RENTAL_LINE }];
  const rentalDays = quoteRentalDays(q.start_date, q.end_date);
  // A1-6: deduplicar por ocurrencia (descripción de la partida), NO por
  // modelo. Antes dos partidas del mismo modelo con cantidades o tarifas
  // distintas colapsaban en una sola y se perdía la segunda.
  const seen = new Set<string>();
  const lines: RentalLineValues[] = [];
  items.forEach((item, index) => {
    const key = item.description ?? `__sin_descripcion_${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    const found = matchModel(item, models);
    lines.push(found ? lineToRentalLine(item, found, rentalDays) : lineToRentalLineFallback(item, rentalDays));
  });
  return lines.length > 0 ? lines : [{ ...EMPTY_RENTAL_LINE }];
}


export function buildPrefillValues(q: ExistingQuote, models: EquipmentModel[]): QuoteFormValues {
  const isSale = q.quote_type === "sale";
  const allItems = (q.line_items as LineItem[]) || [];
  const logistics = extractExtra(allItems, isLogisticsLine);
  const insurance = extractExtra(allItems, isInsuranceLine);
  const nonLogistics = allItems.filter((item) => !isLogisticsLine(item) && !isInsuranceLine(item));

  return {
    quoteType: isSale ? "sale" : "rental",
    customerId: q.customer_id || "",
    customerName: q.customer_name || "",
    currency: (q.currency as "MXN" | "USD") || "MXN",
    tipoCambio: Number(q.tipo_cambio) || 1,
    taxRate: String(q.tax_rate),
    notes: q.notes || "",
    validUntil: q.valid_until ? parseDateLocal(q.valid_until) : undefined,
    dateRange: q.start_date && q.end_date
      ? { from: parseDateLocal(q.start_date), to: parseDateLocal(q.end_date) }
      : undefined,
    rentalLines: isSale ? [{ ...EMPTY_RENTAL_LINE }] : rebuildRentalLines(nonLogistics, q, models),
    saleLines: isSale ? rebuildSaleLines(nonLogistics, models) : [{ ...EMPTY_SALE_LINE }],
    includeLogistics: logistics.include,
    logisticsCost: logistics.cost,
    includeInsurance: insurance.include,
    insuranceCost: insurance.cost,
  };
}

interface Props {
  existingQuote: ExistingQuote | null | undefined;
  equipmentModels: EquipmentModel[] | undefined;
  /** BL-R8-08 (R8-FE-04): flags isSuccess de las queries origen. La data por
   *  sí sola no basta — con cache stale una query puede tener `data` viejo
   *  mientras aún no resuelve la navegación SPA (lista→detalle→editar). */
  quoteReady: boolean;
  modelsReady: boolean;
}

/**
 * R9-P0 (BL-R8-08): reemplaza el `form.reset()` one-shot (ejecutado desde un
 * `useEffect`, ~500ms después del primer render en navegación SPA) por un
 * valor memoizado que se pasa a `useForm({ values })` (RHF v7). RHF
 * resincroniza el form cada vez que cambia la *referencia* de `values`, así
 * que:
 *
 *  - Mientras `existingQuote`/`equipmentModels` no estén listos (`isSuccess`
 *    de ambas queries), devolvemos `undefined` y el form se queda con sus
 *    `defaultValues` (o con lo que el usuario ya haya escrito).
 *  - Cuando ambas resuelven, calculamos `buildPrefillValues` UNA sola vez
 *    por `quoteId` y cacheamos esa referencia (useRef) — si React vuelve a
 *    renderizar con la misma cotización (misma id) pero un array de
 *    `equipmentModels` con nueva identidad (p.ej. refetch de la query),
 *    devolvemos el objeto cacheado en vez de reconstruirlo, para que RHF no
 *    dispare otro reset y no pise ediciones del usuario.
 *  - Si cambia el `quoteId` (otra cotización), se recalcula y cachea de
 *    nuevo — determinista, sin efectos ni timers.
 */
export function useQuotePrefillValues({ existingQuote, equipmentModels, quoteReady, modelsReady }: Props): QuoteFormValues | undefined {
  // Caché derivada en estado (no en ref): calcularla durante el render con
  // `useState` es el patrón soportado por React para memoizar por clave sin
  // efectos ni timers, y no rompe la regla `react-hooks/refs`.
  const source = quoteReady && modelsReady && existingQuote && equipmentModels
    ? { quote: existingQuote, models: equipmentModels, id: existingQuote.id ?? "existing" }
    : null;
  const [cache, setCache] = useState<{ id: string; values: QuoteFormValues } | null>(null);

  if (source && cache?.id !== source.id) {
    setCache({ id: source.id, values: buildPrefillValues(source.quote, source.models) });
  }

  if (!source) return undefined;
  return cache?.id === source.id ? cache.values : undefined;
}


