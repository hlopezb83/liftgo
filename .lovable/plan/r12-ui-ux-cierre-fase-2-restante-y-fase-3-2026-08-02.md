# R12 UI/UX — cierre: Fase 2 restante y Fase 3

Los dos documentos que subiste ya se aplicaron casi por completo:

- **Instrucciones y diffs (R12-FE-01..08, R12-DB-01/02)** — aplicados en v7.275.0.
- **UI/UX Fase 1 (UIX-1..4)** — paleta cálida, escala del Gantt de marca, badges punto+etiqueta, dorado en acciones primarias y header unificado: v7.275.0 y v7.276.0. La ficha de cliente ya usa `DetailPageHeader`, sin título duplicado.
- **UI/UX Fase 2, puntos 2, 3, 5 y 7** — empty states con acento, skeletons con forma (CRM y portal), hover/sticky/tabular-nums en tablas y redirecciones de alias: v7.276.0.

Queda pendiente lo siguiente.

## Fase 2 — lo que falta

1. **Identidad del usuario en la barra superior** — hoy el usuario logueado sólo aparece en el pie del sidebar, y la barra superior tiene migas de pan, buscador y el botón Reportar. Se agrega un menú de usuario con avatar (iniciales o foto), correo, rol, cambio de tema, cambiar contraseña y cerrar sesión, reutilizando lo que ya existe en el pie del sidebar para no duplicar lógica.
2. **Indicador activo del sidebar en dorado** — el ítem activo usa una barra dorada de marca y fondo tenue, en lugar del realce gris actual, alineado con el resto del acento.
3. **Móvil** — barrido en 390px: áreas táctiles de al menos 44px en botones de icono, filas de acción y controles de tabla; y revisión de los modales que hoy se cortan (formularios largos, selector de fechas, diálogos de cierre de OT y de pago) para que su encabezado y botones queden siempre visibles.

## Fase 3

4. **Escala de elevación y radios** — se define una escala corta de sombras (`--shadow-sm/md/lg`) y radios coherentes, y se aplica a cards, popovers y diálogos, que hoy son todos planos con el mismo radio.
5. **Gráficas del dashboard con paleta de marca** — `--chart-3` y `--chart-5` (azul y morado saturados) pasan a la misma escala navy/dorado/tierra del Gantt, para que reportes y dashboard se lean como un solo sistema.
6. **Login con panel de marca** — pantalla de acceso partida: panel oscuro con logo y acento dorado a un lado, formulario al otro; mismo tratamiento en el acceso del portal del cliente.

## Detalles técnicos

- Archivos principales: `src/layouts/MainLayout.tsx` y `src/layouts/sidebar/SidebarUserFooter.tsx` (menú de usuario), `src/layouts/NavLink.tsx` y `src/layouts/AppSidebar.tsx` (activo dorado), `src/index.css` (elevación, radios, `--chart-*`), pantallas de login del staff y del portal.
- El menú de usuario extrae la lógica compartida a un hook o componente reutilizable para que el pie del sidebar y la barra superior no dupliquen código.
- Sin cambios de lógica de negocio ni de base de datos. Los tokens `--destructive`, `--success`, `--warning` e `--info` no se tocan.
- Verificación: `tsgo`, lint, suite de Vitest, y capturas con Playwright en 1600x900 y 390px de dashboard, cotizaciones, facturas, calendario, portal y login.
- Al cierre: entrada v7.277.0 en `public/changelog.json` y `public/changelog/v7.277.0.json`.
