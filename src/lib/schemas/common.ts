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
 *
 * Zod 4: usamos los validadores top-level (`z.email`, `z.uuid`, etc.) por su
 * mejor tree-shaking y por evitar los helpers deprecados de `z.string()`.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Email opcional — acepta cadena vacía o email válido.
// Usado por: customers/suppliers/supplier-contacts.
// ---------------------------------------------------------------------------

/**
 * Campo de email opcional. Default `""` para RHF (evita `undefined` en inputs
 * controlados). Válido si es cadena vacía o pasa el parser de email de Zod 4
 * top-level `z.email()`.
 */
export const optionalEmail = () =>
  z
    .string()
    .default("")
    .refine((v) => !v || z.email().safeParse(v).success, {
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
export const clabeOptional = (message = "La CLABE debe tener 18 dígitos") =>
  z
    .string()
    .default("")
    .refine(isValidClabe, { message });

// ---------------------------------------------------------------------------
// Montos numéricos.
// ---------------------------------------------------------------------------

/**
 * Monto numérico **estricto** > 0. NO coerciona strings.
 *
 * Usar cuando el input proviene de un componente que ya emite `number`
 * (`CurrencyField`, `NumberField`). Si el `<input>` es HTML nativo y emite
 * string, usar `positiveAmountCoerced()`.
 */
export const positiveAmount = (message = "El monto debe ser mayor a 0") =>
  z.number({ error: message }).positive(message);

/**
 * Monto numérico > 0 con **coerción** de string → number.
 *
 * Usar cuando el input viene de un `<input type="number">` nativo que emite
 * string, o de imports XML/CFDI donde los montos llegan como texto.
 */
export const positiveAmountCoerced = (message = "El monto debe ser mayor a 0") =>
  z.coerce.number({ error: message }).positive(message);

/**
 * Monto numérico ≥ 0 con coerción. Útil para subtotales, impuestos y
 * retenciones que pueden ser 0 pero no negativos.
 */
export const nonNegativeAmountCoerced = (message = "No puede ser negativo") =>
  z.coerce.number({ error: message }).nonnegative(message);
