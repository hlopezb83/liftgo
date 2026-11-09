# Selector de pólizas de mantenimiento

La opción «Nueva Póliza» consulta fuentes específicas, sin reutilizar los
listados generales limitados a 501 filas:

- Flota visible, no archivada y sin datos E2E, con sólo los campos del selector.
- Reservas `confirmed` cuyo intervalo incluye hoy, filtradas en PostgREST.
- Referencias de todas las pólizas, incluidas las inactivas. La restricción
  única de `forklift_id` y la regla de exclusión existente no cambian.

Cada lectura usa la organización verificada, el cliente autenticado sujeto a
RLS y páginas por cursor `id`. Una página vacía termina la lectura. El tamaño
de página de 200 no es un máximo global y un `max_rows` menor en PostgREST no
se interpreta como fin de resultados. Un presupuesto de 251 solicitudes o
50,000 filas por fuente evita lecturas ilimitadas: agotarlo produce un error
explícito, sin datos parciales ni reintentos automáticos. El formulario indica
que se necesita revisar la consulta antes de reintentar. Se rechazan respuestas de otra empresa
o cursores que no avanzan. La caché incluye identidad y organización, y sus
claves conservan las invalidaciones de flota, reservas y pólizas.

La selección conserva la regla previa: estado físico `rented`, o `available`
con una reserva confirmada vigente. Mantenimiento, retiro y venta no se
vuelven elegibles por tener reservas. La unidad de la póliza editada sigue
seleccionable aunque ya no esté rentada, siempre que sea visible en la flota.

Mientras cualquiera de las fuentes esté cargando, revalidándose o haya fallado,
no se muestran opciones anteriores ni se habilita guardar. Un fallo en el
listado principal de pólizas también bloquea el formulario. El reintento
consulta todas las fuentes y el listado principal.

## Pruebas offline

```sh
node node_modules/vitest/vitest.mjs run \
  src/features/maintenance/hooks/maintenance/__tests__/useMaintenancePolicyOptions.test.tsx \
  src/features/operations/components/operations/__tests__/MaintenancePolicySelector.test.tsx \
  src/features/operations/components/operations/__tests__/CatalogTabsErrorState.test.tsx
```

El transporte HTTP simulado usa el cliente Supabase real. Cubre más de 501
filas en las tres fuentes, límites API menores al tamaño de página, reservas
futuras que antes desplazaban a una vigente antigua, filtros de empresa/E2E,
estados, edición, fallos de páginas posteriores, reintento, invalidación,
aborto y cambio de identidad. No ejecuta operaciones contra datos reales.

## Límite deliberado

`generate-recurring-maintenance` conserva su regla independiente de generar
cargos sólo para estado físico `rented`. Una unidad `available` con reserva
vigente puede recibir una póliza en el selector, pero eso no amplía por sí
mismo la generación mensual. Esta corrección no cambia esa regla ni aplica
migraciones, despliega o modifica datos.

Las páginas son lecturas separadas, no una instantánea transaccional. Las
restricciones existentes en la base siguen resolviendo conflictos de escritura
concurrentes, como la creación simultánea de otra póliza para la misma unidad.
