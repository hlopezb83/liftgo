# Arreglar la paginación en la lista de Equipos (y tablas similares)

## Qué pasa hoy

Confirmado en el navegador contra `/fleet`: la tabla muestra 25 filas, el botón "Siguiente" existe y sí recibe el clic, pero la página activa se queda en **1** y las filas no cambian. Lo mismo al hacer clic en el número "2".

## Causa

El hook de tablas (`useLiftgoTable`) tiene un efecto que regresa a la página 1 cada vez que **cambia la referencia del arreglo de datos**:

```text
click "Siguiente" -> cambia pageIndex a 1 -> re-render
   -> la página vuelve a crear el arreglo de equipos (map/filtro)
   -> el efecto ve "datos nuevos" y regresa pageIndex a 0
```

En `FleetPage` los datos se derivan en cada render (`visibleListRows(...)`, el remapeo de estado rentado/disponible y el `filtered` de `useTableFilters`), así que el arreglo siempre es "nuevo" aunque el contenido sea idéntico. Resultado: la paginación se auto-reinicia y nunca avanza.

Analogía: es como un elevador con un sensor mal calibrado; cada vez que subes un piso el sensor cree que entró gente nueva y te regresa a la planta baja.

## Solución

1. **`src/components/dataTable/v2/useLiftgoTable.ts`** — cambiar el efecto de reinicio para que dependa de la **huella de contenido** (el `dataVersion` que ya se calcula) y de `resetKey`, en vez de la referencia `tableData`. Así solo se vuelve a la página 1 cuando de verdad cambian los datos o los filtros, no en cada render. Reordenar el cálculo de `dataVersion` para que quede antes del efecto.

2. **`src/features/fleet/pages/FleetPage.tsx`** — memoizar las derivaciones (`visibleListRows` + remapeo `rented/available`) con `useMemo` para no generar arreglos nuevos en cada render; reduce trabajo y evita re-renders innecesarios.

3. **Verificación**: prueba con Playwright en `/fleet` confirmando que "Siguiente", el número de página y "Anterior" cambian la página activa y las filas; revisar además otra lista con más de 25 registros (Facturas o Reservas) para confirmar que el arreglo aplica a todas las tablas.

4. **Regresión**: agregar un test unitario de `useLiftgoTable` que pase un arreglo con nueva referencia pero mismo contenido en cada render y verifique que `pageIndex` se conserva; y que sí se reinicia cuando cambia `resetKey`.

5. **Changelog**: nueva entrada patch (v7.281.1) en `public/changelog.json` + `public/changelog/v7.281.1.json`, y sincronizar `package.json` y `public/version.json`.

## Alcance

Solo lógica de paginación de tablas y memoización en la página de Equipos. Sin cambios de diseño, de base de datos ni de reglas de negocio.
