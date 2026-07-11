/**
 * Wrapper de `zodResolver` para preservar la ergonomía previa a Zod 4.
 *
 * En Zod 4, los schemas con `.default(...)` producen tipos donde
 * `input !== output` (input opcional, output requerido). El `zodResolver`
 * oficial devuelve `Resolver<Input, Ctx, Output>`, lo que fuerza a los
 * formularios a usar la firma `useForm<Input, Ctx, Output>`.
 *
 * Para mantener compatibilidad con nuestra base de código (que usa
 * `useForm<z.infer<typeof schema>>` = tipo output), envolvemos el resolver
 * en modo `raw: true` — que devuelve los valores validados sin transformar
 * el tipo — y lo casteamos a `Resolver<Values>`.
 *
 * Runtime idéntico: la validación sigue siendo Zod. Sólo cambia la
 * inferencia de tipos.
 */
import { zodResolver as baseZodResolver } from "@/lib/forms/zodResolver";
import type { FieldValues, Resolver } from "react-hook-form";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodResolver<Values extends FieldValues>(schema: any): Resolver<Values> {
  // `raw: true` -> Resolver<Input, Ctx, Input>, lo tratamos como Resolver<Values>.
  return baseZodResolver(schema, undefined, { raw: true }) as unknown as Resolver<Values>;
}
