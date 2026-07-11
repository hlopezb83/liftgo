/**
 * Wrapper de `zodResolver` — ver notas más abajo.
 * Renombramos la import para evitar cualquier ambigüedad con nuestro export
 * homónimo (algunas cadenas de source-map fusionaban ambos frames).
 */
import { zodResolver as hookformZodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";

/**
 * Zod 4 diferencia `input` (con `.default` opcional) de `output` (obligatorio).
 * El `zodResolver` oficial devuelve `Resolver<Input, Ctx, Output>`, lo que
 * obliga a firmar los hooks con `useForm<Input, Ctx, Output>`. Para conservar
 * la ergonomía previa (`useForm<z.infer<typeof schema>>` == output) casteamos
 * el resolver a `Resolver<Values>`. La validación en runtime no cambia.
 */
export function zodResolver<Values extends FieldValues>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
): Resolver<Values> {
  return hookformZodResolver(schema) as unknown as Resolver<Values>;
}
