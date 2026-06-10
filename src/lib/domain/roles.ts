import type { Database } from "@/integrations/supabase/types";

/**
 * Tipo canónico de roles de la app, derivado directo del enum `app_role` en DB.
 * Vive en `lib/domain` para que cualquier capa (lib, components, features) pueda
 * importarlo sin generar dependencias hacia features/users.
 */
export type AppRole = Database["public"]["Enums"]["app_role"];

