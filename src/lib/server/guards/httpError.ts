/**
 * Tipos base y error HTTP lógico de los guards administrativos.
 *
 * Vive aparte para que el resto de los módulos de guards no dependan entre sí
 * y no se formen ciclos de importación con la fachada
 * `src/lib/server/adminGuards.server.ts`.
 */
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type AdminClient = SupabaseClient<Database>;
/** Cliente que actúa como el usuario autenticado (RLS aplicada). */
export type CallerClient = SupabaseClient<Database>;

/** Error con status HTTP lógico; el mensaje es lo que ve la interfaz. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export interface AuthorizedCaller {
  userId: string;
  role: AppRole;
  admin: AdminClient;
}
