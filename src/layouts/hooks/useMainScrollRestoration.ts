import { useEffect, useLayoutEffect, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Restaura el scroll del elemento `<main>` al navegar:
 *  - PUSH/REPLACE → resetea a 0 (nueva ruta = arriba).
 *  - POP (back/forward) → restaura el scroll guardado para esa `location.key`.
 *
 * Guarda el scroll actual antes de que la ruta cambie usando `beforeunload`
 * es innecesario aquí porque persiste sólo mientras el SPA vive.
 */
const scrollByKey = new Map<string, number>();

// B-6: el Map vive a nivel módulo y crecía sin tope con cada location.key
// visitada. Se acota a las 50 entradas más recientes (los Map iteran en orden
// de inserción: la primera llave es la más vieja).
const MAX_SCROLL_ENTRIES = 50;

function rememberScroll(key: string, top: number) {
  // Re-insertar para refrescar el orden de inserción (LRU simple).
  scrollByKey.delete(key);
  scrollByKey.set(key, top);
  if (scrollByKey.size > MAX_SCROLL_ENTRIES) {
    const first = scrollByKey.keys().next().value;
    if (first !== undefined) scrollByKey.delete(first);
  }
}

export function useMainScrollRestoration(ref: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navType = useNavigationType();

  // Guardar scroll antes de que el layout se re-pinte con la nueva ruta.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = location.key;
    const onScroll = () => {
      rememberScroll(key, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, location.key]);

  // Aplicar scroll (restore o reset) sincronizado con el paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React Compiler advierte por mutar `ref.current`, pero acá el ref apunta al
    // DOM (<main>) y la mutación es sobre el nodo, no sobre el objeto ref.
    // eslint-disable-next-line react-compiler/react-compiler
    el.scrollTop = navType === "POP" ? (scrollByKey.get(location.key) ?? 0) : 0;
  }, [ref, location.key, navType]);
}
