# Sprints B2 y B3 — bugs bajos restantes

El sprint B1 del paquete (parches 01–11) ya se implementó en v7.326.4–v7.328.1, así que quedan B2 (11 arreglos) y B3 (6 arreglos). Verifiqué contra el código actual una muestra de los hallazgos: `useUpdateSupplier` sigue usando `.single()` sin filtro de borrados, `useServerTodayMty` sigue con `staleTime` de 5 minutos, `PageActionsContext` no restaura acciones al desmontar, `ListToolbar.tsx` no tiene consumidores, y `MaintenancePoliciesTab` sigue filtrando por status crudo.

## Sprint B2 — Mutaciones, formularios y queries

- **F1**: endurecer `useUpdateSupplier` con `.is("deleted_at", null)` y `assertRowsAffected`, quitando `.single()` (mismo patrón que clientes).
- **F2**: límites `.max()` en el esquema de proveedores (nombre, contacto, teléfono, sitio, dirección, notas).
- **F3**: si falla el registro del reporte de feedback, borrar la captura de pantalla ya subida.
- **F4**: alinear el `staleTime` de las URLs firmadas por debajo de su vigencia (feedback 4 min, documentos 50 min).
- **F5**: escapar `%`, `_` y `\` en la búsqueda del feed de actividad.
- **F6**: liberar el object URL del PDF después de un segundo, para evitar la carrera en Firefox.
- **F7**: bajar el `staleTime` de la fecha del servidor de 5 min a 60 s.
- **F8**: convertir el registro de acciones de página en una pila que restaura las acciones previas al desmontar.
- **F9**: proteger los filtros de rango de auditoría contra fechas inválidas.
- **F10**: límite de 2000 caracteres en la nota extra de "cerrar como perdido".
- **F11**: proyección explícita de columnas en los pagos del portal en vez de `select("*")`.

## Sprint B3 — UI menor

- Pólizas de mantenimiento: "rentada" se calcula por reserva vigente (`computeFleetAvailability`), con respaldo al status mientras cargan las reservas.
- Diálogo de cambio de contraseña: mínimo unificado de 8 caracteres y limpieza de campos al cerrar.
- `aria-label="Paginación"` en español.
- Portal "Factura no encontrada": encabezado y botón de regreso.
- Eliminar `ListToolbar.tsx` (sin consumidores).
- Formulario de refacciones: máximo real = existencias (antes caía a 999 con stock 0).

## Detalles técnicos

- Aplicar los parches por sprint en orden (B2 completo, luego B3), revisando cada uno contra el árbol actual; los que ya no apliquen limpio se reescriben a mano.
- No hay migraciones de base de datos en este paquete.
- Pruebas nuevas donde el cambio tiene lógica propia: pila de `PageActions` (desmontaje en orden y fuera de orden), escape de comodines en el feed, guard de fechas inválidas en auditoría, y límites de los esquemas de proveedor y nota de cierre.
- Nota de seguridad del paquete: descarto el parche que borra `.env` — en Lovable Cloud lo administra la plataforma y solo contiene la llave publicable.
- Backlog que el propio paquete deja fuera y no incluyo: `downloadCfdiBlob.ts` (misma clase que F6), notas largas en cierre perdido, mock de `CatalogTabsErrorState.test.tsx` y el texto pelado de `PortalInvoiceDetail.tsx`.
- Cierre: typecheck, ESLint sin advertencias, suite completa y dos entradas de changelog — **v7.329.0** (B2) y **v7.329.1** (B3) — con sincronización de `package.json` y `version.json`.
