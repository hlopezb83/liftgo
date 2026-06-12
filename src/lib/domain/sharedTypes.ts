/**
 * Contratos compartidos entre features (paso 2 de la auditoría).
 *
 * Punto único para tipos de dominio consumidos por más de una feature
 * (`Customer`, `Forklift`, `Booking`, `BookingWithForklift`, `EquipmentModel`).
 *
 * Regla de capas (ver architecture.md §22):
 *   Una feature **no** debe importar hooks internos de otra feature
 *   (`@/features/X/hooks/...`) sólo para obtener un *tipo*. En su lugar,
 *   importar el tipo desde aquí. Los hooks y queries siguen viviendo en
 *   su feature dueña.
 *
 * Las definiciones canónicas siguen en `@/types/rental` (view models
 * compuestos) y en `@/integrations/supabase/types` (filas crudas). Este
 * archivo es un barril estable que aísla a los consumidores cross-feature
 * de cambios internos en la feature dueña.
 */

import type { Tables } from "@/integrations/supabase/types";

export type { Forklift, Booking, BookingWithForklift, ForkliftSnippet } from "@/types/rental";

export type Customer = Tables<"customers">;
export type EquipmentModel = Tables<"equipment_models">;
export type Supplier = Tables<"suppliers">;
