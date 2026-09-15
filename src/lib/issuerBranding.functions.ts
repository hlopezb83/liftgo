/**
 * Server function que expone el emisor (razón social, RFC, domicilio, logo)
 * de la organización verificada o del documento autorizado.
 *
 * La identidad y la organización salen del token verificado; el navegador
 * sólo puede proponer el documento, cuya pertenencia se comprueba aquí.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ISSUER_DOCUMENT_TABLES,
  IssuerBrandingError,
  resolveIssuerBranding,
  type IssuerBrandingClient,
  type IssuerBrandingResult,
} from "@/lib/branding/resolveIssuerBranding";
import {
  OrganizationContextError,
  resolveOrganizationContext,
  type OrganizationContextClient,
} from "@/lib/organization/resolveOrganizationContext";

export interface IssuerBrandingPayload {
  result: IssuerBrandingResult | null;
  /** Código de error de lectura; el cliente lo trata como estado de error. */
  errorCode: string | null;
}

const DOCUMENT_TYPES = Object.keys(ISSUER_DOCUMENT_TABLES) as [
  "invoice",
  ...("credit_note" | "payment" | "contract" | "quote" | "customer" | "booking")[],
];

const inputSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES).optional(),
    documentId: z.string().uuid().optional(),
  })
  .optional();

export const getIssuerBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ context, data }): Promise<IssuerBrandingPayload> => {
    const document = data?.documentType && data?.documentId
      ? { type: data.documentType, id: data.documentId }
      : null;

    try {
      const orgContext = await resolveOrganizationContext(
        context.supabase as unknown as OrganizationContextClient,
        context.userId,
      );
      const result = await resolveIssuerBranding(
        context.supabase as unknown as IssuerBrandingClient,
        orgContext,
        document,
      );
      return { result, errorCode: null };
    } catch (error) {
      const code = error instanceof IssuerBrandingError || error instanceof OrganizationContextError
        ? error.code
        : "unexpected_error";
      console.error("[issuer-branding]", code);
      return { result: null, errorCode: code };
    }
  });
