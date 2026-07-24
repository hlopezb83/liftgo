import { z } from "zod";

/**
 * Schema del formulario de cancelación de CFDI.
 *
 * Regla SAT: motivo `01` (Comprobantes emitidos con errores con relación)
 * REQUIERE `substitution_uuid` — el UUID de la factura que sustituye a la
 * cancelada. El PAC rechaza con CFDI-40224 si va sin UUID. Bloquear en
 * cliente evita gastar timbre y ruido al usuario.
 *
 * Motivos permitidos:
 *   01 → Comprobantes emitidos con errores con relación (necesita UUID)
 *   02 → Comprobantes emitidos con errores sin relación
 *   03 → No se llevó a cabo la operación
 *   04 → Operación nominativa relacionada en factura global
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cancelCfdiSchema = z
  .object({
    motive: z.string().min(1),
    substitutionUuid: z.string().default(""),
  })
  .refine(
    (v) => v.motive !== "01" || UUID_RE.test(v.substitutionUuid.trim()),
    {
      path: ["substitutionUuid"],
      message: "UUID inválido",
    },
  );

export type CancelCfdiFormValues = z.infer<typeof cancelCfdiSchema>;
