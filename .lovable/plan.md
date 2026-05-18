# Plan v6.3.1 — COMPLETADO

Todos los pasos materiales se ejecutaron en la ola v6.3.1. Cierre formal de los dos ítems revisados al final:

## Estado final

1. **Mapeo de `line_items` entre prefill hooks** — **No aplica.** Tras revisión, `useQuotePrefill` y `useInvoicePrefill` no comparten lógica real de mapeo: el primero reconstruye `RentalLine[]`/`SaleLine[]` con tarifas por modelo de equipo, el segundo enriquece `CfdiLineItem[]` con claves SAT (`clave_prod_serv`, `clave_unidad`, `objeto_imp`) y asignaciones forklift→línea. Extraer un wrapper común sería abstracción artificial que acoplaría dominios distintos (cotización vs CFDI). Se conserva la separación actual.

2. **`useCompanySettings`** — **No requiere división.** Tras extraer `useBillingSecrets` en v6.3.1 el archivo quedó en **52 LOC**, bajo el límite documentado de 80 LOC para hooks. Sin acción.

3-7. **Completados en v6.3.1** (ver `public/changelog/v6.3.1.json`).

## Próximas olas (diferidas)

- Barrels públicos `src/features/<x>/index.ts` (requiere decisión de API pública por feature).
- 21 hooks restantes 80-119 LOC: dentro de tolerancia documentada en `architecture.md` §19.
