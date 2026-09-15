/**
 * Server function que expone el contexto de organización del usuario firmado.
 * La identidad sale del token verificado (`requireSupabaseAuth`); el navegador
 * no puede proponer una organización.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OrganizationContextError,
  resolveOrganizationContext,
  type OrganizationContextClient,
  type OrganizationContextResult,
} from "@/lib/organization/resolveOrganizationContext";

export type { OrganizationContextResult };

export interface OrganizationContextPayload {
  context: OrganizationContextResult | null;
  /** Código de error de verificación; el cliente lo trata como estado de error. */
  errorCode: string | null;
}

export const getOrganizationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizationContextPayload> => {
    try {
      const result = await resolveOrganizationContext(
        context.supabase as unknown as OrganizationContextClient,
        context.userId,
      );
      return { context: result, errorCode: null };
    } catch (error) {
      const code = error instanceof OrganizationContextError ? error.code : "unexpected_error";
      console.error("[organization-context]", code);
      return { context: null, errorCode: code };
    }
  });
