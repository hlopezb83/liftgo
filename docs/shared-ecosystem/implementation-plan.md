# Plan de implementación: ecosistema compartido LiftGo

## Objetivo

Permitir que las sociedades que operan bajo la marca LiftGo compartan maestros
técnicos, legales y de marca sin mezclar su operación, contabilidad ni datos
comerciales.

El sistema manejará cuatro ámbitos explícitos:

1. **Global LiftGo:** catálogo visible para el personal interno de todas las
   organizaciones. Sólo un `platform_operator` puede modificarlo.
2. **Organización:** configuración y operación privada de una sociedad.
3. **Red con publicación voluntaria:** información que una organización decide
   ofrecer a otras organizaciones, como disponibilidad de equipos o piezas.
4. **Snapshot:** copia inmutable utilizada en documentos firmados o emitidos.

## Decisión sobre la semilla

La organización fundadora, **Org 1**, será el machote inicial de los datos
globales. Se identifica como la organización activa más antigua
(`ORDER BY created_at, id`). La migración falla si no puede identificarla.

Estado observado antes de preparar la migración 0046:

- 8 modelos de equipo en Org 1.
- 0 refacciones en Org 1.
- 1 plantilla de contrato y pagaré en Org 1.

Estos conteos son informativos. La migración lee los datos existentes cuando se
ejecuta y no fija cantidades ni UUID de producción.

### Datos promovidos desde Org 1

- Fabricante, modelo, capacidad, altura de mástil y combustible.
- SKU, nombre y categoría de refacción, cuando existan SKUs válidos.
- Texto, declaraciones, cláusulas, checklist y pagaré de las plantillas.

### Datos que permanecen locales

- Tarifas diarias, semanales y mensuales.
- Unidades físicas, números de serie y disponibilidad.
- Stock, mínimos, costo y ubicación de refacciones.
- Datos fiscales, cuentas bancarias, secretos y folios.
- Contratos firmados, facturas, pagos, reservas y clientes.

## Fase 0 — Cimientos aditivos

**Entrega en Git:** migración `0046_liftgo_shared_catalogs_foundation.sql`.

### Incluye

- `brand_assets` para activos oficiales de LiftGo.
- `equipment_model_catalog` como ficha técnica global.
- `parts_catalog` y `parts_catalog_equipment_models`.
- `legal_template_definitions` y versiones append-only.
- `organization_legal_template_assignments`.
- Enlaces opcionales desde `equipment_models`, `parts_inventory` y
  `contract_templates`.
- Semilla y enlaces de Org 1.
- RLS global/local y prueba A/B.

### No incluye

- Cambios de consultas o pantallas.
- Eliminación de columnas existentes.
- Asignación automática de Org 2.
- Despliegue a Lovable Cloud.

### Criterios de aceptación

- Org 1 queda enlazada a todos los registros promovidos.
- Org A y Org B leen el mismo catálogo global.
- Portal y `anon` no leen los catálogos internos.
- Un administrador de organización no modifica datos globales.
- Un `platform_operator` puede crear y actualizar maestros globales.
- Las versiones legales no se pueden editar ni borrar desde una sesión
  autenticada.
- Las asignaciones legales no cruzan organizaciones.

## Fase 1 — Modelos globales de equipo

**Estado:** completada y desplegada en Lovable Cloud. Org 1 y Org 2 tienen los
8 modelos enlazados al mismo maestro; producción sirve la interfaz `v8.38.0`.

1. Publicar funciones de plataforma para crear, actualizar y desactivar modelos.
2. Construir la pantalla **Catálogo LiftGo de modelos** para operadores de
   plataforma.
3. Convertir `equipment_models` en configuración local enlazada al catálogo:
   alias, habilitación y tarifas recomendadas/locales.
4. Cambiar formularios de flota y cotización para seleccionar un modelo global.
5. Enlazar Org 2 con los modelos que decida utilizar.
6. Hacer obligatorio `catalog_model_id` después de resolver excepciones.

### Pruebas

- Ambas organizaciones ven la misma ficha técnica.
- Cambiar una tarifa en A no modifica B.
- Crear una unidad en A no la hace visible en B.
- Sólo plataforma modifica fabricante, modelo o especificaciones.

## Fase 2 — SKUs globales e inventario local

**Estado:** implementación preparada en Git mediante la migración `0048` y las
interfaces global/local. Org 1 tiene 0 refacciones, por lo que la carga inicial
se mantiene vacía hasta contar con SKUs reales aprobados.

1. Cargar o capturar en Org 1 el maestro inicial de refacciones.
2. Publicar administración de `parts_catalog` para plataforma.
3. Enlazar cada fila de `parts_inventory` a `catalog_part_id`.
4. Mantener localmente stock, mínimo, costo, ubicación y precio.
5. Mostrar compatibilidad SKU-modelo desde el catálogo global.
6. Hacer obligatorio el vínculo cuando todos los registros estén conciliados.

### Pruebas

- SKU y descripción son iguales para A y B.
- Stock, costo y ubicación no cruzan organizaciones.
- Un mecánico puede consumir stock local sin editar el maestro global.
- Un SKU global puede estar desactivado localmente sin borrarse de la red.

## Fase 3 — Contratos y pagarés versionados

1. Revisar legalmente la versión importada desde Org 1.
2. Publicar el editor de versiones para plataforma.
3. Definir un esquema permitido de `local_overrides`:
   ciudad, jurisdicción, representante, testigos y datos del emisor.
4. Resolver la plantilla efectiva como versión global + overrides locales.
5. Guardar en cada contrato el identificador de versión y su `signed_snapshot`.
6. Asignar explícitamente la versión aprobada a cada organización.

### Pruebas

- Una nueva versión no altera contratos anteriores.
- La versión y el checksum quedan auditables.
- Una organización no asigna ni modifica la configuración de otra.
- El contrato renderizado usa datos fiscales de la organización emisora.

## Fase 4 — Marca y formatos documentales

1. Mantener `/brand/liftgo-montacargas.png` como logo oficial inicial.
2. Consumir `brand_assets` sólo para activos administrados por plataforma.
3. Compartir layouts de cotización, contrato, entrega, devolución y servicio.
4. Conservar datos fiscales, folios y cuentas bancarias por organización.
5. Retirar `company_settings.logo_url` de formularios y tipos cuando ya no tenga
   consumidores ni referencias históricas necesarias.

## Fase 5 — Catálogos operativos y capacitación

1. Catálogo global de tipos de equipo, combustible y unidades de medida.
2. Planes de mantenimiento y checklists por modelo.
3. Boletines técnicos, recalls y campañas de seguridad.
4. Manual global LiftGo versionado con suplementos locales.
5. Confirmación de lectura de políticas críticas por usuario.

## Fase 6 — Colaboración voluntaria entre organizaciones

1. Publicación explícita de disponibilidad de equipos y refacciones.
2. Solicitudes de transferencia con estados y auditoría.
3. Datos mínimos compartidos: modelo/SKU, ciudad, cantidad y ventana.
4. Costos, clientes, contratos y ubicaciones exactas permanecen privados.

## Fase 7 — Indicadores de red

1. Métricas agregadas por modelo, territorio y periodo.
2. Benchmarks de utilización y demanda sin exponer operaciones individuales.
3. Acceso sólo para plataforma y vistas agregadas autorizadas.
4. Pruebas que impidan reconstruir datos sensibles de una organización.

## Estrategia de despliegue

Cada fase seguirá este orden:

1. Migración aditiva.
2. Pruebas RLS y A/B desde una base limpia.
3. Validación reversible en Lovable Cloud.
4. Despliegue de base.
5. Lecturas duales o feature flag.
6. Migración y conciliación de datos.
7. Corte de interfaz.
8. Eliminación de compatibilidad únicamente en una fase posterior.

No se reutilizará `organization_id` para datos globales. Un registro será global
por pertenecer a una tabla global, no por usar `organization_id = NULL`.

## Riesgos y controles

- **Duplicados técnicos:** índices normalizados por fabricante/modelo y SKU.
- **Promoción incorrecta:** procedencia registrada con
  `source_organization_id` y `source_record_id`.
- **Cambios legales retroactivos:** versiones append-only y snapshot firmado.
- **Fuga entre empresas:** overlays con RLS estricta y pruebas A/B.
- **Edición global accidental:** sólo `platform_operators` escriben maestros.
- **Corte prematuro:** vínculos opcionales durante la transición y preflight
  antes de volverlos obligatorios.
