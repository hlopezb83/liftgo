/**
 * TS-01: adjunta el access_token vigente de la sesión a TODA llamada de
 * server function.
 *
 * `requireSupabaseAuth` (servidor) exige `Authorization: Bearer <jwt>`. Las
 * llamadas del cliente sólo enviaban `data`, así que las siete funciones
 * migradas se rechazaban con "Unauthorized: No authorization header
 * provided" antes de llegar al backend.
 *
 * Se registra una sola vez como `functionMiddleware` en `src/start.ts`.
 * Nunca se usa service-role en navegador ni se envía el token por URL,
 * logs o payload de negocio: viaja únicamente en el encabezado.
 */
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return next();
    }
    return next({ headers: { Authorization: `Bearer ${token}` } });
  },
);
