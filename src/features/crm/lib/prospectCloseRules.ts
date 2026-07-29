/**
 * V3-2 · Reglas puras del cierre de un prospecto.
 *
 * La base de datos (`validate_prospect_stage_transition`) solo permite pasar a
 * `cerrado_ganado` desde `negociacion`, y `validate_prospect_close` exige un
 * `final_amount > 0`. Estas funciones replican esas reglas en el cliente para
 * deshabilitar controles en vez de mostrar un error SQL crudo.
 */

export const WON_SOURCE_STAGE = "negociacion";

export function canCloseAsWon(stage: string | null | undefined, hasPermission: boolean): boolean {
  return hasPermission && stage === WON_SOURCE_STAGE;
}

export function wonBlockedReason(stage: string | null | undefined): string | undefined {
  return stage === WON_SOURCE_STAGE ? undefined : "Sólo se puede cerrar un deal en etapa Negociación";
}

export function isValidFinalAmount(amount: number | null | undefined): boolean {
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}
