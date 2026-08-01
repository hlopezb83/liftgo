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
  tax_rate: number | string; currency?: string; notes?: string | null;
  valid_until?: string | null; line_items?: unknown; rental_meta?: unknown;
};

const matchModel = (item: LineItem, models: EquipmentModel[]) =>
  models.find((m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model));

function extractLogistics(items: LineItem[]): { include: boolean; cost: number } {
  const logisticsItem = items.find((item) => item.description?.includes("Logística"));
  if (!logisticsItem) return { include: false, cost: 0 };
  return { include: true, cost: logisticsItem.unit_price || logisticsItem.total || 0 };
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

function lineToRentalLine(item: LineItem, found: EquipmentModel): RentalLineValues {
  return {
    modelId: found.id,
    quantity: 1,
    dailyRate: found.default_daily_rate ?? 0,
    weeklyRate: found.default_weekly_rate ?? 0,
    monthlyRate: found.default_monthly_rate ?? 0,
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
 * ($20,000/mes → $640,000). Sin pista, se asume diaria (comportamiento previo).
 */
export function rentalRateField(description?: string | null): "dailyRate" | "weeklyRate" | "monthlyRate" {
  const d = (description ?? "").toLowerCase();
  if (d.includes("mensual") || d.includes("/mes")) return "monthlyRate";
  if (d.includes("semanal") || d.includes("/semana")) return "weeklyRate";
  return "dailyRate";
}

function lineToRentalLineFallback(item: LineItem): RentalLineValues {
  // R10-FE-03 (P1): NO sintetizar la tarifa desde `total` (importe de la
  // partida): al multiplicarse por los días de renta genera totales fantasma.
  const rate = Number(item.unit_price) || 0;
  const field = rentalRateField(item.description);
  return {
    modelId: "",
    // R10-FE-03 (P1): cotizaciones legacy usan `qty` (no `quantity`).
    quantity: Number(item.quantity ?? legacyQty(item)) || 1,
    dailyRate: field === "dailyRate" ? rate : 0,
    weeklyRate: field === "weeklyRate" ? rate : 0,
    monthlyRate: field === "monthlyRate" ? rate : 0,
    discount: item.discount || 0,
    discountType: (item.discount_type || "%") as "%" | "$",
  };
}


function normalizeRentalLine(raw: Partial<RentalLineValues> | undefined): RentalLineValues {
  return {
    modelId: raw?.modelId ?? "",
    quantity: raw?.quantity ?? 1,
    dailyRate: raw?.dailyRate ?? 0,
    weeklyRate: raw?.weeklyRate ?? 0,
    monthlyRate: raw?.monthlyRate ?? 0,
    // R-M11: cotizaciones legacy pueden traer `rental_meta` sin `discount`
    // ni `discountType`. Sin defaults, el zod resolver rechaza el submit con
    // "se esperaba número, recibido indefinido" al editar.
    discount: raw?.discount ?? 0,
    discountType: (raw?.discountType ?? "%") as "%" | "$",
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
  const matched = new Map<string, RentalLineValues>();
  const fallbackDescriptions = new Set<string>();
  const fallbackLines: RentalLineValues[] = [];
  for (const item of items) {
    const found = matchModel(item, models);
    if (found) {
      if (!matched.has(found.id)) matched.set(found.id, lineToRentalLine(item, found));
      continue;
    }
    // R9VTA-04: sin match de modelo, conservar la partida histórica en vez
    // de descartarla (dedupe por descripción para no duplicar breakdown
    // diario/semanal/mensual de una misma partida legacy).
    const key = item.description ?? "";
    if (!fallbackDescriptions.has(key)) {
      fallbackDescriptions.add(key);
      fallbackLines.push(lineToRentalLineFallback(item));
    }
  }
  const arr = [...matched.values(), ...fallbackLines];
  return arr.length > 0 ? arr : [{ ...EMPTY_RENTAL_LINE }];
}

export function buildPrefillValues(q: ExistingQuote, models: EquipmentModel[]): QuoteFormValues {
  const isSale = q.quote_type === "sale";
  const allItems = (q.line_items as LineItem[]) || [];
  const logistics = extractLogistics(allItems);
  const nonLogistics = allItems.filter((item) => !item.description?.includes("Logística"));

  return {
    quoteType: isSale ? "sale" : "rental",
    customerId: q.customer_id || "",
    customerName: q.customer_name || "",
    currency: (q.currency as "MXN" | "USD") || "MXN",
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


