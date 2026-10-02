import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { type CallerClient, HttpError } from "./httpError";
import { requirePlatformOperator } from "./platformOperator.server";
import { requirePlatformSession } from "./platformSession.server";
import { enforceRateLimit } from "./rateLimit.server";

function passwordClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new HttpError(503, "Servicio de confirmación no disponible. Reintenta.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_publishable_") && headers.get("Authorization") === `Bearer ${key}`) {
        headers.delete("Authorization");
      }
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

async function ownVerifiedEmail(caller: CallerClient, userId: string) {
  const authorization = getRequest()?.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Vuelve a iniciar sesión.");
  const own = await caller.auth.getUser(authorization.slice(7));
  if (own.error || own.data.user?.id !== userId || !own.data.user.email || !own.data.user.email_confirmed_at) {
    throw new HttpError(401, "Vuelve a iniciar sesión para confirmar tu identidad.");
  }
  return own.data.user.email;
}

/** Confirmación de una sola operación. No devuelve tokens ni guarda la contraseña. */
export async function requirePlatformPassword(caller: CallerClient, userId: string, password: string) {
  const session = await requirePlatformSession(caller);
  const { admin } = await requirePlatformOperator(caller, userId, "operators.manage");
  await enforceRateLimit(admin, "platform_access_change", userId, 5, 60);
  const email = await ownVerifiedEmail(caller, userId);
  const isolated = passwordClient();
  const confirmation = await isolated.auth.signInWithPassword({ email, password });
  const temporaryToken = confirmation.data.session?.access_token;
  // Sólo se revoca la sesión temporal creada aquí; nunca las sesiones del ERP.
  if (temporaryToken) {
    const cleanup = await admin.auth.admin.signOut(temporaryToken, "local");
    if (cleanup.error) throw new HttpError(503, "No se pudo cerrar la confirmación. Reintenta en unos segundos.");
  }
  if (confirmation.error || confirmation.data.user?.id !== userId || !temporaryToken) {
    throw new HttpError(403, "No se pudo confirmar tu contraseña actual.");
  }
  const current = await requirePlatformSession(caller);
  if (current.id !== session.id) throw new HttpError(401, "La sesión cambió. Vuelve a iniciar sesión.");
  await requirePlatformOperator(caller, userId, "operators.manage");
  return { admin, sessionId: session.id };
}
