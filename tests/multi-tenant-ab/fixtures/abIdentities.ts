/**
 * Identidades sintéticas y deterministas del gate A/B.
 *
 * Todos los UUID son literales fabricados para el runner efímero: no existen
 * en ninguna base real y no derivan de datos productivos. Los correos usan el
 * dominio reservado `example.invalid` y las contraseñas se generan en cada
 * corrida (desechables, nunca versionadas ni publicadas como artifact).
 */

import { randomBytes } from "node:crypto";

export const AB_ORG_A = {
  id: "a0000000-0000-4000-8000-000000000001",
  name: "Empresa Ficticia A (gate A/B)",
  slug: "ab-gate-org-a",
} as const;

export const AB_ORG_B = {
  id: "b0000000-0000-4000-8000-000000000002",
  name: "Empresa Ficticia B (gate A/B)",
  slug: "ab-gate-org-b",
} as const;

export const AB_CUSTOMER_A = "a0000000-0000-4000-8000-0000000000c1";
export const AB_CUSTOMER_B = "b0000000-0000-4000-8000-0000000000c2";

export const AB_INVOICE_A = "a0000000-0000-4000-8000-0000000000f1";
export const AB_INVOICE_B = "b0000000-0000-4000-8000-0000000000f2";

export const AB_DOCUMENT_A = "a0000000-0000-4000-8000-0000000000d1";
export const AB_DOCUMENT_B = "b0000000-0000-4000-8000-0000000000d2";

export const AB_INVOICE_NUMBER_A = "AB-A-0001";
export const AB_INVOICE_NUMBER_B = "AB-B-0001";

export const AB_INVOICE_TOTAL_A = 1234.56;
export const AB_INVOICE_TOTAL_B = 7890.12;

export const AB_BUCKET = "documents";
export const AB_RELATIVE_OBJECT = "ab-gate/factura.txt";
/** Objeto legado SIN prefijo de organización: nadie autenticado debe alcanzarlo. */
export const AB_LEGACY_OBJECT = "ab-gate-legacy/sin-prefijo.txt";

export const AB_EMAILS = {
  internalA: "ab-gate-interno-a@example.invalid",
  internalB: "ab-gate-interno-b@example.invalid",
  portalA: "ab-gate-portal-a@example.invalid",
  portalB: "ab-gate-portal-b@example.invalid",
  platformOperator: "ab-gate-operador@example.invalid",
} as const;

export type AbRole = keyof typeof AB_EMAILS;

/** Contraseña desechable de un solo uso para el runner efímero. */
export function disposablePassword(): string {
  return `Ab!${randomBytes(18).toString("base64url")}`;
}

export function storagePathFor(organizationId: string): string {
  return `${organizationId}/${AB_RELATIVE_OBJECT}`;
}
