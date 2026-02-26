

# Pagina de Changelog con Versionado Semantico

## Resumen

Se creara una pagina estatica `/changelog` dentro de la app que muestra un historial organizado por fecha de todos los cambios realizados al sistema, usando versionado semantico (MAJOR.MINOR.PATCH).

No se necesita base de datos para esto -- el changelog sera un archivo de datos estatico en el codigo fuente que se puede actualizar manualmente con cada cambio futuro.

---

## Versionado Semantico

Basandome en el historial completo de migraciones y funcionalidades, este es el versionado propuesto:

- **v1.0.0** (12 Feb 2026) - Lanzamiento inicial: Flota, reservas, calendario
- **v1.1.0** (13 Feb 2026) - Clientes, mantenimiento, facturas, modelos de equipo
- **v1.2.0** (13 Feb 2026) - Devoluciones, entregas, documentos adjuntos
- **v2.0.0** (14 Feb 2026) - Autenticacion, roles (admin/dispatcher/mechanic), control de acceso, cotizaciones, feed de actividad, registro de danos
- **v2.0.1** (14 Feb 2026) - Procedimientos atomicos (crear reserva, eliminar equipo, completar inspeccion)
- **v2.0.2** (14 Feb 2026) - Indices de rendimiento en base de datos
- **v2.0.3** (15 Feb 2026) - Cancelacion de reservas, restriccion de nombres/series unicos en equipos
- **v2.1.0** (15 Feb 2026) - Choferes, mecanicos, datos fiscales (CFDI), configuracion de empresa
- **v2.2.0** (15 Feb 2026) - Contratos, pagos, auditoria detallada por campo
- **v2.3.0** (23 Feb 2026) - Portal de clientes (rol customer, login, dashboard, facturas, contratos)
- **v2.3.1** (23 Feb 2026) - Dashboard mejorado (estado sold, utilizacion semanal, exclusion de retirados)
- **v2.4.0** (23 Feb 2026) - Rol "administrativo" con permisos completos de operacion
- **v2.4.1** (23 Feb 2026) - Correccion de permisos de perfil para clientes vs staff
- **v2.5.0** (24 Feb 2026) - Rol "auditor" con permisos de solo lectura en todo el sistema
- **v2.5.1** (24 Feb 2026) - Actividad en espanol, traducciones del feed
- **v3.0.0** (25 Feb 2026) - Machote de contrato profesional: 8 clausulas legales, Anexo A (checklist), Anexo B (pagare), PDF multi-pagina, plantillas de contrato
- **v3.0.1** (26 Feb 2026) - Campo de representante legal en clientes, integracion con contrato y pagare

---

## Implementacion

### 1. Archivo de datos del changelog (`src/lib/changelog.ts`)

Un arreglo TypeScript con la estructura:

```typescript
interface ChangelogEntry {
  version: string;        // "3.0.1"
  date: string;           // "2026-02-26"
  type: "major" | "minor" | "patch";
  title: string;          // Titulo corto
  description: string;    // Descripcion en lenguaje simple
  changes: string[];      // Lista de cambios puntuales
}
```

Contendra las ~16 entradas listadas arriba, con descripciones claras y no tecnicas de cada cambio.

### 2. Pagina del changelog (`src/pages/ChangelogPage.tsx`)

- Titulo "Historial de Cambios" con subtitulo "Version actual: v3.0.1"
- Linea de tiempo vertical con cada version como una tarjeta
- Cada tarjeta muestra: badge de version con color segun tipo (rojo=major, azul=minor, gris=patch), fecha, titulo, descripcion y lista de cambios
- Filtro por tipo de cambio (Todos / Mayor / Menor / Parche)
- Diseno consistente con el resto de la app usando Card, Badge, PageHeader

### 3. Ruta y navegacion

- Agregar ruta `/changelog` en `App.tsx` (sin restriccion de rol, todos pueden verla)
- Agregar link "Changelog" en el sidebar bajo el grupo "Administracion" con icono `ScrollText` o `FileText`

---

## Archivos a crear/modificar

1. **Crear** `src/lib/changelog.ts` - Datos del changelog con las 16 entradas
2. **Crear** `src/pages/ChangelogPage.tsx` - Componente de la pagina
3. **Modificar** `src/App.tsx` - Agregar lazy import y ruta
4. **Modificar** `src/components/AppSidebar.tsx` - Agregar link en navegacion

No se requieren cambios de base de datos.

