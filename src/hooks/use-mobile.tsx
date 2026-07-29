import { useMediaQuery } from "usehooks-ts";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/**
 * R24-B: al imprimir, el page box de la hoja (<768px) disparaba la vista móvil
 * y las listas salían como tarjetas paginadas en vez de la tabla completa.
 * `matchMedia('print')` es true durante la impresión, así que la anulamos.
 */
function usePrintMedia(): boolean {
  return useMediaQuery("print");
}

/** True cuando el viewport es < 768px (móvil) y no estamos imprimiendo. */
export function useIsMobile(): boolean {
  const isPrinting = usePrintMedia();
  const isNarrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, { initializeWithValue: true });
  return isNarrow && !isPrinting;
}

/** True cuando el viewport es < 1024px (móvil o tablet) y no estamos imprimiendo. */
export function useIsTabletOrBelow(): boolean {
  const isPrinting = usePrintMedia();
  const isNarrow = useMediaQuery(`(max-width: ${TABLET_BREAKPOINT - 1}px)`, { initializeWithValue: true });
  return isNarrow && !isPrinting;
}
