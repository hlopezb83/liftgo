/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_SIGNIN_ERROR_TOAST_ID, dismissNotification } from "@/lib/ui/appFeedback";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Subscribe first so we don't miss any auth events fired during bootstrap.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
      // Hallazgo 3: con sesión válida establecida, el error de un intento
      // fallido previo ya no aplica — se descarta obligatoriamente aquí.
      if (nextSession) dismissNotification(AUTH_SIGNIN_ERROR_TOAST_ID);
    });

    // Defensive bootstrap: if INITIAL_SESSION never fires (SDK bug, network blip)
    // this guarantees isLoading transitions to false. Setters are idempotent.
    supabase.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));

    return () => subscription.unsubscribe();
  }, []);


  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    // B-4: si supabase.auth.signOut() rechaza (red caída, etc.) la purga de
    // localStorage NO se saltaba y quedaba un unhandled rejection. try/finally
    // garantiza la purga; el catch hace fallback a signOut local (silencioso).
    try {
      await supabase.auth.signOut();
    } catch {
      // Fallback silencioso: revocar solo la sesión local sin llamar al server.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch { /* nada más que hacer; el finally igual purga la cache */ }
    } finally {
      // MP-M5: logout determinista — limpiar la cache persistida de TanStack Query.
      // Evita que datos residuales de un usuario aparezcan al iniciar sesión otro.
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("liftgo:rq-cache:v3");
          window.localStorage.removeItem("liftgo:rq-cache:v2"); // legacy
        }
      } catch { /* storage puede estar bloqueado; no romper logout */ }
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    return { error };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, []);

  // Memoizar el value evita re-renders en cascada de TODA la app cuando
  // cualquier hijo se actualiza por motivos no relacionados con auth.
  const value = useMemo(
    () => ({ user, session, isLoading, signIn, signOut, resetPassword, updatePassword }),
    [user, session, isLoading, signIn, signOut, resetPassword, updatePassword],
  );

  // React 19: `<Context>` como Provider directo, sin `.Provider`.
  return <AuthContext value={value}>{children}</AuthContext>;
}


export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
