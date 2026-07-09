/**
 * Schemas Zod compartidos para validaciones de dominio recurrentes.
 *
 * Centraliza refinements que antes vivían inline en cada schema de formulario
 * (customers, suppliers, accounts-payable, portal, invoices, crm, operations),
 * garantizando que un cambio en la regla se refleje en toda la app.
 *
 * Convención: los helpers son **fábricas** (funciones) para preservar la
 * naturaleza inmutable de Zod y permitir componer con `.optional()`, `.nullable()`,
 * `.transform()`, etc., sin efectos colaterales entre consumidores.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Email opcional — acepta cadena vacía o email válido.
// Usado por: customers/suppliers/supplier-contacts.
// ---------------------------------------------------------------------------

/**
 * Campo de email opcional. Default `""` para RHF (evita `undefined` en inputs
 * controlados). Válido si es cadena vacía o pasa el parser de email de Zod.
 */
export const optionalEmail = () =>
  z
    .string()
    .default("")
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Correo electrónico inválido",
    });

// ---------------------------------------------------------------------------
// RFC (Registro Federal de Contribuyentes, México)
// Formato: 3-4 letras + 6 dígitos (AAMMDD) + 3 alfanuméricos (homoclave).
// Persona moral: 12 caracteres. Persona física: 13.
// ---------------------------------------------------------------------------

const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

/**
 * RFC opcional. Trim + uppercase para normalizar entrada del usuario.
 * Valida formato solo si hay valor.
 */
export const rfcOptional = () =>
  z
    .string()
    .default("")
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => !v || RFC_REGEX.test(v), { message: "RFC inválido (formato AAAA000000AAA)" });

/**
 * RFC obligatorio (uso fiscal: emisor, receptor de CFDI).
 * Trim + uppercase + validación estricta.
 */
export const rfcRequired = () =>
  z
    .string()
    .min(1, "RFC requerido")
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => RFC_REGEX.test(v), { message: "RFC inválido (formato AAAA000000AAA)" });

// ---------------------------------------------------------------------------
// CLABE bancaria (18 dígitos, México)
// ---------------------------------------------------------------------------

export const CLABE_REGEX = /^[0-9]{18}$/;

/**
 * Predicado puro para validar una CLABE. Acepta `null`/`undefined`/`""` como
 * válido (uso opcional). Trim implícito para tolerar espacios.
 */
export const isValidClabe = (v: string | null | undefined): boolean =>
  !v || CLABE_REGEX.test(v.trim());

/**
 * Campo CLABE opcional para formularios (default `""`, valida 18 dígitos si hay valor).
 */
export const clabeOptional = () =>
  z
    .string()
    .default("")
    .refine(isValidClabe, { message: "La CLABE debe tener 18 dígitos" });

// ---------------------------------------------------------------------------
// Monto positivo.
// ---------------------------------------------------------------------------

/**
 * Monto numérico > 0. Mensaje por defecto en es-MX; se puede sobreescribir por contexto.
 *
 * Usa `z.number()` (no `coerce`) para preservar la inferencia estricta que RHF
 * espera cuando el input proviene de `CurrencyField`/`NumberField` (que ya
 * emiten `number`). Si el formulario recibe strings sin transformar, envuelve
 * con `z.preprocess(Number, positiveAmount())` en el schema del feature.
 */
export const positiveAmount = (message = "El monto debe ser mayor a 0") =>
  z.number({ invalid_type_error: message }).positive(message);

