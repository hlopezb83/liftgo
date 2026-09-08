/**
 * TS-04: el contenedor de scroll de la app es `<main id="main-content">`, que
 * persiste entre rutas. Sin declararlo en `scrollToTopSelectors`, `onRendered`
 * de router-core hereda la posición de la entrada anterior en una navegación
 * NUEVA (PUSH) y sobrescribe el reset del hook `useMainScrollRestoration`.
 *
 * Se exporta para que las pruebas usen exactamente la misma opción que
 * producción.
 */
export const SCROLL_TO_TOP_SELECTORS = ["#main-content"] as const;
