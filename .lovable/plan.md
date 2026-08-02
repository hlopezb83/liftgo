# R12 UI/UX — lo que falta (v7.276.0)

Los fixes funcionales de R12 (cotizaciones legacy, precio pactado, fechas Monterrey, SPEI/antigüedad sin borradores, permisos por rol) ya se aplicaron en v7.275.0, igual que la paleta cálida base y la escala del Gantt derivada de marca. Este plan cubre sólo lo que quedó pendiente del paquete visual.

## Fase 1 (pendiente)

1. **Badges de estado unificados (UIX-2)** — `StatusBadge` pasa al patrón punto de color + etiqueta en `--foreground`, con fondo al 10% y borde al 20% del token semántico. Se conservan los mismos estados y etiquetas; sólo cambia la presentación, así que todas las tablas quedan consistentes sin tocar sus columnas. Se sube el contraste de "Vencido" a ~5.3:1.
2. **Acento dorado en acciones primarias** — el navy se queda como color de marca estructural (sidebar, títulos); el dorado se usa en el botón primario y en el indicador del ítem activo del sidebar, en vez de cambiar `--primary` completo. Esto evita que cada botón navy de la app cambie de golpe y mantiene el contraste AA.
3. **Header de página unificado (UIX-4)** — barrido por las pantallas principales para que todas usen `PageHeader`/`DetailPageHeader` con el mismo patrón (título, subtítulo, acciones a la derecha) y eliminar el título duplicado en la ficha de cliente.

## Fase 2 (incluida en este sprint)

4. **Empty states con marca** — `EmptyState` con acento dorado sutil y CTA primario; aplicarlo donde hoy hay vacíos crudos (portal del cliente, CxP, CRM).
5. **Skeletons con forma** — los bloques genéricos de CxP y CRM pasan a `TableSkeleton`/`CardListSkeleton` que imitan el layout real.
6. **Tablas** — hover de fila con `--accent`, encabezado sticky en listas largas y `tabular-nums` en columnas de importes.
7. **Portal del cliente** — mismos tokens, cards con borde y sombra sutil, header y empty states como el resto de la app.
8. **Redirecciones de alias** — `/payments`, `/prospects`, `/availability`, `/cash-flow` apuntan a sus rutas reales en vez de 404.

## Fuera de alcance

Fase 3 (escala de elevación, rediseño de data-viz del dashboard, login con panel de marca) queda para una iteración posterior.

## Detalles técnicos

- Cambios concentrados en `src/index.css` (tokens), `src/components/feedback/StatusBadge.tsx`, `EmptyState.tsx`, `src/components/layout/PageHeader.tsx`, la tabla `DataTableV2`, rutas en `src/App.tsx`/`routes` y las pantallas del portal.
- Sin cambios de lógica de negocio ni de base de datos; `--destructive`, `--success`, `--warning` e `--info` no se tocan.
- Verificación: `tsgo`, lint, suite de Vitest, y capturas antes/después con Playwright de dashboard, cotizaciones, facturas, calendario y portal en escritorio y móvil.
- Al cierre: nueva entrada v7.276.0 en `public/changelog.json` y `public/changelog/v7.276.0.json`.
