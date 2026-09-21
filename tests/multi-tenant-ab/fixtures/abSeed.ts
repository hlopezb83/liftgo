/**
 * Seed del gate multiempresa A/B.
 *
 * Crea, SOLO contra el Supabase local efímero y a través de la API admin,
 * dos empresas ficticias con: personal interno, cliente de portal, relación
 * comercial, una factura, un documento y un objeto de Storage bajo el prefijo
 * de su propio `organization_id`. Añade además un objeto legado sin prefijo
 * para comprobar que nadie autenticado lo alcanza.
 *
 * Datos 100% sintéticos y deterministas. Ninguna credencial se versiona: las
 * contraseñas se generan por corrida y viven solo en el estado local del job.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AB_BUCKET,
  AB_CUSTOMER_A,
  AB_CUSTOMER_B,
  AB_DOCUMENT_A,
  AB_DOCUMENT_B,
  AB_EMAILS,
  AB_INVOICE_A,
  AB_INVOICE_B,
  AB_INVOICE_NUMBER_A,
  AB_INVOICE_NUMBER_B,
  AB_INVOICE_TOTAL_A,
  AB_INVOICE_TOTAL_B,
  AB_LEGACY_OBJECT,
  AB_ORG_A,
  AB_ORG_B,
  disposablePassword,
  storagePathFor,
} from "./abIdentities";
import { createLocalAdminClient } from "./localBackend";

export const AB_CONTEXT_FILE = "tests/multi-tenant-ab/.state/ab-context.json";

export type AbSide = {
  organizationId: string;
  organizationName: string;
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  documentId: string;
  storagePath: string;
  internal: { email: string; password: string; userId: string };
  portal: { email: string; password: string; userId: string };
};

export type AbContext = {
  A: AbSide;
  B: AbSide;
  legacyObjectPath: string;
  /** Operador de plataforma sintético usado para activar la empresa B. */
  platformOperatorUserId: string;
};

function must(label: string, error: { message?: string } | null): void {
  if (error) throw new Error(`[ab-seed] ${label}: ${error.message ?? "error desconocido"}`);
}

async function createUser(
  admin: SupabaseClient,
  email: string,
  organizationId: string,
): Promise<{ email: string; password: string; userId: string }> {
  const password = disposablePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { organization_id: organizationId },
  });
  must(`alta de usuario (${email.split("@")[0]})`, error);
  const userId = data?.user?.id;
  if (!userId) throw new Error("[ab-seed] el alta de usuario no devolvió id.");
  return { email, password, userId };
}

/**
 * Siembra una empresa completa.
 *
 * `active`: la empresa A se crea activa; la B se crea SUSPENDIDA y se activa
 * al final por la vía oficial (`platform_set_organization_active`). Motivo: el
 * guard `enforce_organization_write_context` exige contexto explícito cuando
 * hay más de una empresa activa, y las filas derivadas de `customers` (tabla
 * de identidad global, sin `organization_id`) no lo llevan. Sembrar B mientras
 * sólo A está activa respeta el contrato sin tocar el guard.
 */
async function seedSide(
  admin: SupabaseClient,
  org: { id: string; name: string; slug: string },
  ids: {
    customerId: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceTotal: number;
    documentId: string;
    internalEmail: string;
    portalEmail: string;
  },
  active: boolean,
): Promise<AbSide> {
  must(
    "organizations",
    (await admin.from("organizations").insert({
      id: org.id,
      name: org.name,
      slug: org.slug,
      is_active: active,
    })).error,
  );

  // `created_by_organization_id` explícito: el contrato documentado en la
  // migración 0030 pide que los fixtures A/B declaren la empresa dueña.
  must(
    "customers",
    (await admin.from("customers").insert({
      id: ids.customerId,
      name: `Cliente ficticio de ${org.name}`,
      created_by_organization_id: org.id,
    })).error,
  );

  // La relación puede haberla creado ya el trigger de alta cuando sólo hay una
  // empresa activa; el upsert la deja idéntica en ambos casos.
  must(
    "organization_customers",
    (await admin.from("organization_customers").upsert(
      {
        organization_id: org.id,
        customer_id: ids.customerId,
        razon_social: `${org.name} SA de CV`,
        status: "active",
      },
      { onConflict: "organization_id,customer_id" },
    )).error,
  );


  const internal = await createUser(admin, ids.internalEmail, org.id);
  const portal = await createUser(admin, ids.portalEmail, org.id);

  must(
    "user_roles (interno admin)",
    (await admin.from("user_roles").insert({ user_id: internal.userId, role: "admin" })).error,
  );

  must(
    "organization_memberships",
    (await admin.from("organization_memberships").insert([
      { organization_id: org.id, auth_user_id: internal.userId, member_type: "internal" },
      { organization_id: org.id, auth_user_id: portal.userId, member_type: "portal" },
    ])).error,
  );

  must(
    "customer_portal_accounts",
    (await admin.from("customer_portal_accounts").insert({
      organization_id: org.id,
      customer_id: ids.customerId,
      auth_user_id: portal.userId,
      email: portal.email,
      status: "active",
    })).error,
  );

  must(
    "invoices",
    (await admin.from("invoices").insert({
      id: ids.invoiceId,
      organization_id: org.id,
      customer_id: ids.customerId,
      invoice_number: ids.invoiceNumber,
      customer_name: `Cliente ficticio de ${org.name}`,
      total: ids.invoiceTotal,
      subtotal: ids.invoiceTotal,
      status: "sent",
    })).error,
  );

  const storagePath = storagePathFor(org.id);
  const upload = await admin.storage
    .from(AB_BUCKET)
    .upload(storagePath, new Blob([`documento sintetico de ${org.slug}`], { type: "text/plain" }), {
      upsert: true,
      contentType: "text/plain",
    });
  must("storage upload", upload.error);

  must(
    "documents",
    (await admin.from("documents").insert({
      id: ids.documentId,
      organization_id: org.id,
      entity_type: "invoice",
      entity_id: ids.invoiceId,
      file_name: `${ids.invoiceNumber}.txt`,
      file_url: storagePath,
      mime_type: "text/plain",
    })).error,
  );

  return {
    organizationId: org.id,
    organizationName: org.name,
    customerId: ids.customerId,
    invoiceId: ids.invoiceId,
    invoiceNumber: ids.invoiceNumber,
    invoiceTotal: ids.invoiceTotal,
    documentId: ids.documentId,
    storagePath,
    internal,
    portal,
  };
}

/**
 * Alta del operador de plataforma del ensayo (usuario sintético del runner).
 * Es la vía oficial para activar una empresa: `platform_set_organization_active`
 * exige un operador verificado. No se toca el guard ni las políticas.
 */
async function createPlatformOperator(admin: SupabaseClient): Promise<string> {
  const password = disposablePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: AB_EMAILS.platformOperator,
    password,
    email_confirm: true,
  });
  must("alta del operador de plataforma", error);
  const userId = data?.user?.id;
  if (!userId) throw new Error("[ab-seed] el alta del operador no devolvió id.");

  must("profiles (operador activo)", (await admin.from("profiles").update({ is_active: true }).eq("user_id", userId)).error);
  must("platform_operators", (await admin.from("platform_operators").insert({ auth_user_id: userId })).error);
  return userId;
}

export async function seedAbEnvironment(): Promise<AbContext> {
  const admin = createLocalAdminClient("seed");

  // 1. A se crea activa: con UNA sola empresa activa el guard de contexto
  //    resuelve por compatibilidad las filas derivadas sin organization_id.
  const A = await seedSide(
    admin,
    AB_ORG_A,
    {
      customerId: AB_CUSTOMER_A,
      invoiceId: AB_INVOICE_A,
      invoiceNumber: AB_INVOICE_NUMBER_A,
      invoiceTotal: AB_INVOICE_TOTAL_A,
      documentId: AB_DOCUMENT_A,
      internalEmail: AB_EMAILS.internalA,
      portalEmail: AB_EMAILS.portalA,
    },
    true,
  );

  const operatorId = await createPlatformOperator(admin);

  // 2. B se siembra COMPLETA mientras sigue suspendida (sólo A activa).
  const B = await seedSide(
    admin,
    AB_ORG_B,
    {
      customerId: AB_CUSTOMER_B,
      invoiceId: AB_INVOICE_B,
      invoiceNumber: AB_INVOICE_NUMBER_B,
      invoiceTotal: AB_INVOICE_TOTAL_B,
      documentId: AB_DOCUMENT_B,
      internalEmail: AB_EMAILS.internalB,
      portalEmail: AB_EMAILS.portalB,
    },
    false,
  );

  const legacy = await admin.storage
    .from(AB_BUCKET)
    .upload(AB_LEGACY_OBJECT, new Blob(["objeto legado sin prefijo"], { type: "text/plain" }), {
      upsert: true,
      contentType: "text/plain",
    });
  must("storage upload (legado)", legacy.error);

  // 3. Activación de B por la RPC oficial de plataforma.
  must(
    "platform_set_organization_active(B)",
    (await admin.rpc("platform_set_organization_active", {
      p_actor: operatorId,
      p_organization_id: AB_ORG_B.id,
      p_active: true,
    })).error,
  );

  // 4. Verificación por API admin ANTES de guardar el contexto: el ensayo sólo
  //    es válido con las DOS empresas activas.
  const { data: orgs, error: orgsError } = await admin
    .from("organizations")
    .select("id, is_active")
    .in("id", [AB_ORG_A.id, AB_ORG_B.id]);
  must("verificación de empresas activas", orgsError);
  const inactive = (orgs ?? []).filter((row) => row.is_active !== true);
  if ((orgs ?? []).length !== 2 || inactive.length > 0) {
    throw new Error(
      "[ab-seed] el ensayo requiere las dos empresas activas y no quedaron ambas activas tras el seed.",
    );
  }

  const context: AbContext = {
    A,
    B,
    legacyObjectPath: AB_LEGACY_OBJECT,
    platformOperatorUserId: operatorId,
  };
  mkdirSync(dirname(AB_CONTEXT_FILE), { recursive: true });
  writeFileSync(AB_CONTEXT_FILE, JSON.stringify(context, null, 2), { mode: 0o600 });
  return context;
}


export function readAbContext(): AbContext {
  return JSON.parse(readFileSync(AB_CONTEXT_FILE, "utf8")) as AbContext;
}
