import { useState } from "react";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";
import {
  buildPrefillValues,
  type EquipmentModel,
  type ExistingQuote,
} from "./quotePrefill.logic";

export {
  buildPrefillValues,
  quoteRentalDays,
  rentalRateField,
  type EquipmentModel,
  type ExistingQuote,
} from "./quotePrefill.logic";

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
 *    por `quoteId` y cacheamos esa referencia (useState) — si React vuelve a
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
