# Auditoría arquitectónica — LiftGo

**Alcance:** análisis read-only de `src/` (~1,124 archivos TS/TSX, excluyendo `supabase/functions`). No se modifica código.

## Veredicto general

La arquitectura está **madura y bien organizada**. La migración a `src/features/<dominio>/{components,hooks,pages,lib}` (v5.79 → v6.0) se completó, no queda deuda de shims, y las convenciones core se respetan:

- **0 componentes/páginas** importan `@/integrations/supabase/client` directamente (verificado con `rg` sobre `features/*/components` y `features/*/pages`).
- **0 componentes** contienen `useQuery`/`useMutation` inline (data fetching vive en `hooks/`).
- **0 usos** de `as any`, **0** non-null assertions (`x!.y`), sólo 5 `TODO/FIXME` en todo `src/`.
- Convención `features/<x>/{hooks,lib}` seguida por 27/29 dominios.

Los hallazgos siguientes son **puntos de pulido**, no problemas estructurales.

---

## Hallazgos priorizados

### 🟠 P1 — Críticos para mantenibilidad

**1. `src/layouts/GlobalSearch.tsx` (258 LOC) importa Supabase directamente y define query keys de negocio.**
- Ubicación equivocada: la búsqueda global consulta 6+ dominios (bookings, invoices, customers, quotes, contracts, forklifts) desde el layout.
- Rompe la regla "UI shell no habla con la base de datos"; también hay `src/layouts/lib/queryKeys.ts` con claves que pertenecen a los features.
- **Recomendación:** extraer `useGlobalSearch()` a `src/features/system/` (o crear `features/search/`) y dejar en `layouts/` sólo el componente presentacional.

**2. Dos features sin convención completa: `calendar` (sin `lib/`), `operations` (sin `hooks/`), `system` y `__tests__` vacíos de estructura.**
- Riesgo: cuando alguien agregue lógica a `operations`, no sabrá dónde va y terminará en el componente.
- **Recomendación:** crear los directorios canónicos aunque estén vacíos con un `README.md` explicando el patrón, o eliminar `system`/`__tests__` si son huérfanos.

**3. `src/hooks/` mezcla utilidades genuinamente cross-cutting con hooks que ya deberían vivir en un feature.**
- Cross-cutting legítimos: `useDebouncedValue`, `useDialogState`, `useIsMounted`, `useUnsavedChangesGuard`, `use-mobile`, `useNavigateTransition`, `usePullToRefresh`, `useListPage`, `usePrefillEffect`, `useOptimisticStatus`, `filters/*`.
- **Ambiguo:** `useDocuments.ts` (documentos es un dominio con sus propias RLS/tests). Evaluar mover a `features/documents/` o dejar documentado por qué es global.

---

### 🟡 P2 — Alto valor, bajo riesgo

**4. Dependencias cruzadas entre features (3 archivos importan ≥4 features distintos).**
- `src/features/quotes/hooks/quoteDetail/useQuoteDetailData.ts` importa `bookings`, `customers`, `fleet`, `invoices`.
- `src/features/invoices/pages/InvoiceDetail.tsx` y `useInvoiceFormLogic.ts` similar.
- No es un bug (los detalles compuestos son inherentemente cross-domain), pero conviene documentar la dirección permitida (p.ej. "features de transacciones pueden leer de features de catálogo, nunca al revés") para prevenir ciclos futuros.
- **Recomendación:** añadir regla ESLint `boundaries` o `no-restricted-imports` con matriz explícita.

**5. Inconsistencia `api/` layer.**
- Sólo `features/invoices/` tiene subdirectorio `api/`. El resto pone las llamadas dentro de `hooks/`.
- **Recomendación:** decidir un patrón único (mi voto: mantener todo en `hooks/` porque ya está estandarizado con `useEntityMutation`/`defineEntityQueries`) y migrar o justificar el caso de `invoices/api/`.

**6. Archivos grandes que rozan el límite de 300 LOC del skill de calidad.**
- `src/components/layout/ListPageLayout.tsx` (330 LOC): centro neurálgico del listado; considerar extraer `ListPageFilters`, `ListPageFooter` (loadMore + paginación) y `ListPageMobileCards` para bajar de 200 LOC.
- `src/features/quotes/pages/QuoteForm.tsx` (259 LOC): la lógica ya está en `useQuoteFormLogic`, pero el JSX podría partirse en secciones (`<QuoteHeaderSection/>`, `<QuoteRentalSection/>`, `<QuoteTotalsSection/>`).
- `src/layouts/GlobalSearch.tsx` (ver P1).
- `src/features/dashboard/lib/queryKeys.ts` (231 LOC): probable oportunidad de generar keys con helper en vez de listar 1×1.

---

### 🟢 P3 — Mejoras opcionales / cosméticas

**7. `src/components/` está limpio, pero `src/components/domain/` mezcla wrappers reutilizables (`DetailRow`, `TotalsSummary`) con `ReadOnlyLineItemsTable` que sólo se usa en facturas/cotizaciones.**
- Si `ReadOnlyLineItemsTable` sólo lo usan `invoices` y `quotes`, moverlo a uno de ellos o a un nuevo `features/billing-shared/` que ambos consuman.
- Auditar los otros componentes de `domain/` con el mismo criterio.

**8. Barril `src/lib/domain/` está creciendo (13 archivos: `contractTypes`, `customerTypes`, `creditNoteMotives`, `paymentIntentStatus`, `feedbackMessages`, etc.).**
- Muchos son *constantes de dominio* que pertenecerían mejor a `features/<x>/lib/constants.ts`. Solo `invoiceHelpers`/`invoiceTotals`/`rentalCalculation` son puramente reutilizables.
- **Recomendación:** mover cada `*Types.ts`/`*Motives.ts` al feature dueño; dejar en `src/lib/domain/` sólo lo genuinamente cross-domain.

**9. `src/features/invoices/hooks/` tiene 4 sub-carpetas (`invoiceDetail`, `invoiceForm`, `invoices`, `creditNotes`, `reconciliation`) — el patrón funciona bien; propagarlo a `bookings/hooks/` y `quotes/hooks/` que también son features grandes reduciría la mezcla actual.**

**10. Tests co-ubicados vs `src/test/`.**
- `src/test/` retiene 18 archivos legacy (`coerce.test.ts`, `formatCurrency.test.ts`, `templateUtils.test.ts`, etc.) que ya tienen equivalente co-ubicado bajo `__tests__/`. Verificar duplicación y consolidar.

---

## Plan de acción sugerido (orden ejecutable)

1. **P1-1** Mover `GlobalSearch` a `features/system/` (o `features/search/`) — 1 sesión.
2. **P1-2** Normalizar directorios de `calendar`, `operations`, `system` (+ README explicativo) — 15 min.
3. **P1-3** Decidir destino de `useDocuments` (mover o documentar) — 30 min.
4. **P2-4** Añadir regla ESLint de límites entre features + matriz permitida — 1 sesión.
5. **P2-5** Consolidar patrón: eliminar `features/invoices/api/` moviendo su contenido a `hooks/` — 1 sesión.
6. **P2-6** Partir los 3 archivos > 250 LOC (`ListPageLayout`, `QuoteForm`, `GlobalSearch`) — 1-2 sesiones.
7. **P3-7** Reubicar `ReadOnlyLineItemsTable` y auditar `components/domain/` — 30 min.
8. **P3-8** Mover constantes de dominio de `src/lib/domain/` a sus features — 1 sesión.
9. **P3-9** Sub-organizar `bookings/hooks` y `quotes/hooks` por caso de uso — 1 sesión.
10. **P3-10** Deduplicar `src/test/` vs `__tests__/` co-ubicados — 1 sesión.

**Riesgo:** todos los cambios son movimientos de archivos + ajustes de imports. Cero cambios de lógica, cero cambios de UI, cero cambios de datos. Cobertura de tests actual (~157 en invoices, cientos totales) hace la validación rápida.

## Detalles técnicos

- Verificación de "0 supabase en UI" hecha con `rg -l "@/integrations/supabase/client" src/features/*/components src/features/*/pages` → sin resultados.
- Verificación de "0 fetching en UI": `rg -l "useQuery\(|useMutation\(" src/features/*/components` → sin resultados.
- Métricas anti-patrones: 0 `as any`, 0 `!.`, 5 `TODO/FIXME`.
- Archivos > 300 LOC (excluyendo tests y `supabase/types.ts` autogenerado): sólo `ListPageLayout.tsx` (330) y `chart.tsx` de shadcn (312, intocable).
- El único acoplamiento real de UI a Supabase vive en `src/layouts/GlobalSearch.tsx` y su `queryKeys.ts` acompañante.
