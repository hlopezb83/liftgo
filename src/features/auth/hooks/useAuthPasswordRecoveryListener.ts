import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escucha eventos de Supabase Auth y dispara `onRecovery()` cuando
 * el usuario entra al flujo de "olvidé mi contraseña".
 *
 * Aísla el acceso a `supabase.auth.onAuthStateChange()` para que la
 * vista (AuthPage) no dependa directamente del cliente de backend.
 */
export function useAuthPasswordRecoveryListener(onRecovery: () => void): void {
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") onRecovery();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [onRecovery]);
}
