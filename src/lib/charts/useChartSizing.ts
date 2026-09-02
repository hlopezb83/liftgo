import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Fase 2 móvil (auditoría 692×764): las gráficas de Reportes se diseñaron para
 * escritorio. En pantallas chicas las etiquetas rotadas se recortaban contra el
 * borde inferior y el eje de categorías (200px) se comía el área de barras.
 * Este hook centraliza las medidas dependientes del ancho para no repetirlas.
 */
export function useChartSizing() {
  const isMobile = useIsMobile();

  return {
    isMobile,
    /** Tick un punto más chico en móvil para que quepan más etiquetas. */
    tick: { fontSize: isMobile ? 10 : 11 } as const,
    /** Props del eje X con etiquetas rotadas (más alto en móvil, si no se cortan). */
    rotatedXAxis: {
      angle: -35,
      textAnchor: "end" as const,
      height: isMobile ? 76 : 60,
      interval: 0 as const,
    },
    /** Ancho del eje Y con importes compactos ($1.2M). */
    moneyAxisWidth: isMobile ? 52 : 80,
    /** Ancho del eje de categorías en gráficas horizontales. */
    categoryAxisWidth: isMobile ? 92 : 200,
    /** Alto del área de la gráfica: más aire en móvil por las etiquetas rotadas. */
    chartHeightClass: isMobile ? "h-72" : "h-64",
  };
}

/** Recorta etiquetas largas del eje de categorías en móvil (con elipsis). */
export function truncateAxisLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
