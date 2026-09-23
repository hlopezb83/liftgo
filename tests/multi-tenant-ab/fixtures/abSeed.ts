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
  /** Empresas iniciales que el ensayo suspendió y debe restaurar al terminar. */
  initialActiveOrganizationIds: string[];
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

  // El trigger `handle_new_user` ya crea la fila de `user_roles` al dar de
  // alta el usuario por `auth.admin.createUser`: un INSERT plano revienta con
  // duplicate key ("user_roles_one_role_per_user"). Mismo patrón que las
  // suites SQL del repo y las funciones de invitación: upsert por user_id.
  must(
    "user_roles (interno admin)",
    (await admin
      .from("user_roles")
      .upsert({ user_id: internal.userId, role: "admin" }, { onConflict: "user_id" })).error,
  );
  must(
    "user_roles (portal customer)",
    (await admin
      .from("user_roles")
      .upsert({ user_id: portal.userId, role: "customer" }, { onConflict: "user_id" })).error,
  );

  // Verificación explícita por API admin: interno=admin y portal=customer.
  const { data: rolesData, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", [internal.userId, portal.userId]);
  must("verificación de roles", rolesError);
  const roleOf = (userId: string) =>
    (rolesData ?? []).find((row) => row.user_id === userId)?.role;
  if (roleOf(internal.userId) !== "admin" || roleOf(portal.userId) !== "customer") {
    throw new Error(
      `[ab-seed] roles inesperados para ${org.slug}: interno=${roleOf(internal.userId) ?? "sin rol"}, portal=${roleOf(portal.userId) ?? "sin rol"}.`,
    );
  }

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

  // Una factura fuera de borrador exige al menos una partida en `line_items`
  // cuyo importe cuadre con `subtotal` (trigger `validate_invoice_line_items_signs`).
  // Forma canónica de `e2e_seed_portal_scenario`: una partida con quantity 1,
  // unit_price = total = subtotal. tax_rate/tax_amount por defecto en 0.
  must(
    "invoices",
    (await admin.from("invoices").insert({
      id: ids.invoiceId,
      organization_id: org.id,
      customer_id: ids.customerId,
      invoice_number: ids.invoiceNumber,
      customer_name: `Cliente ficticio de ${org.name}`,
      line_items: [
        {
          description: `Partida sintética ${org.slug}`,
          quantity: 1,
          unit_price: ids.invoiceTotal,
          total: ids.invoiceTotal,
        },
      ],
      subtotal: ids.invoiceTotal,
      tax_rate: 0,
      tax_amount: 0,
      total: ids.invoiceTotal,
      status: "sent",
    })).error,
  );

  // Verificación por API admin: status sent, pertenece a la org y exactamente
  // una partida cuyo total coincide con el subtotal.
  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("status, organization_id, subtotal, line_items")
    .eq("id", ids.invoiceId)
    .single();
  must("verificación de factura", invErr);
  if (!inv || inv.status !== "sent" || inv.organization_id !== org.id) {
    throw new Error(
      `[ab-seed] factura inesperada para ${org.slug}: status=${inv?.status}, org=${inv?.organization_id}.`,
    );
  }
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  if (items.length !== 1 || Number(items[0]?.total) !== Number(inv.subtotal)) {
    throw new Error(
      `[ab-seed] partidas inválidas para ${org.slug}: count=${items.length}, itemTotal=${items[0]?.total}, subtotal=${inv.subtotal}.`,
    );
  }

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

  // 0055 no crea perfil cuando el alta no incluye app_metadata.organization_id.
  // El operador de plataforma no pertenece todavía a una empresa del ensayo.
  must("profiles (operador activo)", (await admin.from("profiles").upsert({
    user_id: userId,
    full_name: "Operador de plataforma de prueba",
    email: AB_EMAILS.platformOperator,
    is_active: true,
  }, { onConflict: "user_id" })).error);
  must("platform_operators", (await admin.from("platform_operators").insert({ auth_user_id: userId })).error);
  return userId;
}

/** Cambia el estado activo de una empresa SIEMPRE por la RPC oficial. */
async function setOrganizationActive(
  admin: SupabaseClient,
  actorId: string,
  organizationId: string,
  active: boolean,
): Promise<void> {
  must(
    `platform_set_organization_active(${active ? "activar" : "suspender"})`,
    (await admin.rpc("platform_set_organization_active", {
      p_actor: actorId,
      p_organization_id: organizationId,
      p_active: active,
    })).error,
  );
}

export async function seedAbEnvironment(): Promise<AbContext> {
  const admin = createLocalAdminClient("seed");

  // 1. El operador sintético se crea ANTES que cualquier empresa: es la única
  //    vía oficial para cambiar el estado activo de una organización.
  const operatorId = await createPlatformOperator(admin);

  // 2. Las migraciones dejan una organización inicial activa. Con ella activa,
  //    crear A daría DOS activas y el guard de contexto rechazaría las filas
  //    derivadas sin organization_id (p. ej. las de `customers`). Se suspenden
  //    por la RPC oficial; nada de UPDATE directo ni triggers deshabilitados.
  const { data: preexisting, error: preexistingError } = await admin
    .from("organizations")
    .select("id, is_active")
    .eq("is_active", true);
  must("lectura de empresas iniciales", preexistingError);
  const initialActiveOrganizationIds = (preexisting ?? [])
    .map((row) => row.id as string)
    .filter((id) => id !== AB_ORG_A.id && id !== AB_ORG_B.id);

  for (const id of initialActiveOrganizationIds) {
    await setOrganizationActive(admin, operatorId, id, false);
  }

  // 3. Verificación: no debe quedar ninguna empresa activa antes de sembrar.
  const { data: stillActive, error: stillActiveError } = await admin
    .from("organizations")
    .select("id")
    .eq("is_active", true);
  must("verificación de empresas iniciales suspendidas", stillActiveError);
  if ((stillActive ?? []).length > 0) {
    throw new Error(
      "[ab-seed] quedaron empresas iniciales activas; el ensayo no puede continuar de forma determinista.",
    );
  }

  // 4. A se crea activa: con UNA sola empresa activa el guard de contexto
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

  // 5. B se siembra COMPLETA mientras sigue suspendida (sólo A activa).
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

  // 6. Activación de B por la misma RPC oficial.
  await setOrganizationActive(admin, operatorId, AB_ORG_B.id, true);

  // 7. Verificación ANTES de guardar el contexto: exactamente A y B activas y
  //    ninguna empresa inicial activa.
  const { data: activeNow, error: activeNowError } = await admin
    .from("organizations")
    .select("id")
    .eq("is_active", true);
  must("verificación de empresas activas", activeNowError);
  const activeIds = (activeNow ?? []).map((row) => row.id as string).sort();
  const expectedIds = [AB_ORG_A.id, AB_ORG_B.id].sort();
  if (activeIds.length !== 2 || activeIds[0] !== expectedIds[0] || activeIds[1] !== expectedIds[1]) {
    throw new Error(
      "[ab-seed] el ensayo requiere exactamente las empresas A y B activas y ninguna empresa inicial activa.",
    );
  }

  const context: AbContext = {
    A,
    B,
    legacyObjectPath: AB_LEGACY_OBJECT,
    platformOperatorUserId: operatorId,
    initialActiveOrganizationIds,
  };
  mkdirSync(dirname(AB_CONTEXT_FILE), { recursive: true });
  writeFileSync(AB_CONTEXT_FILE, JSON.stringify(context, null, 2), { mode: 0o600 });
  return context;
}



export function readAbContext(): AbContext {
  return JSON.parse(readFileSync(AB_CONTEXT_FILE, "utf8")) as AbContext;
}
