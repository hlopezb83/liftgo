/**
 * Marca **global** de LiftGo: única fuente de logo para todas las
 * organizaciones.
 *
 * Decisión del propietario (2026-09-18): ninguna organización tiene logo
 * propio. El lockup oficial «LIFT GO MONTACARGAS» vive como asset local
 * versionado del repositorio y se usa igual en el shell del ERP, el portal y
 * los documentos generados (cotización, reserva, contrato, factura, estado de
 * cuenta y demás PDF).
 *
 * `company_settings.logo_url` queda **sin uso**: no se lee para renderizar,
 * no se firma por organización y no se descarga desde hosts externos.
 */

/** Lockup oficial completo (colores y proporciones originales del PNG). */
export const GLOBAL_BRAND_LOCKUP_PATH = "/brand/liftgo-montacargas.png";

/** Emblema compacto, para contenedores donde el lockup no es legible. */
export const GLOBAL_BRAND_MARK_PATH = "/favicon.png";

/** Nombre global del producto. */
export const GLOBAL_BRAND_NAME = "LiftGo";
