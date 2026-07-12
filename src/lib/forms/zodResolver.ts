/**
 * Wrapper único de `zodResolver` para react-hook-form + Zod 4.
 *
 * Toda la app importa desde `@/lib/forms/zodResolver` — nunca directo desde
 * `@hookform/resolvers/zod`. Esto nos deja:
 *
 * 1. Aislar la incompatibilidad Input↔Output introducida por Zod 4: el resolver
 *    oficial devuelve `Resolver<Input, Ctx, Output>`, lo que obligaría a firmar
 *    todos los hooks como `useForm<Input, Ctx, Output>`. Casteamos a
 *    `Resolver<Values>` para conservar la ergonomía previa
 *    (`useForm<z.infer<typeof schema>>` == output).
 * 2. Cambiar la librería subyacente sin tocar 40+ formularios.
 *
 * Guía rápida de tipos en el consumidor:
 * - Schema **sin** `.transform()` / `.pipe()` / `.default()` obligatorio:
 *     `type Values = z.infer<typeof schema>` (=`z.output`).
 * - Schema **con** `.transform()` / `.pipe()` o `.default()` donde los tipos
 *   del formulario deben permitir el input crudo (p.ej. RHF renderiza el
 *   campo antes de correr el pipe):
 *     `type Values = z.input<typeof schema>`.
 */
import { zodResolver as hookformZodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import type { FieldValues, Resolver } from "react-hook-form";

export function zodResolver<Values extends FieldValues, Output = Values>(
  schema: ZodType<Output, Values>,
): Resolver<Values> {
  return hookformZodResolver(schema) as unknown as Resolver<Values>;
}
