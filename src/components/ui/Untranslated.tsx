import type { ReactNode, HTMLAttributes } from "react";

interface UntranslatedProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** Etiqueta HTML a usar. Default: span (inline). */
  as?: "span" | "div";
}

/**
 * Envuelve contenido dinámico que no debe traducirse (nombres propios de
 * clientes, folios, RFC, IDs, marcas de equipo). Combina el atributo estándar
 * HTML `translate="no"` con la clase legacy `notranslate` para máxima
 * cobertura entre Chrome/Edge/Safari Translate.
 *
 * Uso: <Untranslated>{customer.name}</Untranslated>
 */
export function Untranslated({ children, as = "span", className, ...rest }: UntranslatedProps) {
  const Comp = as;
  return (
    <Comp
      translate="no"
      className={["notranslate", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </Comp>
  );
}
