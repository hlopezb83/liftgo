

## Análisis y Recomendación de Navegación del Sidebar

### Estructura actual

```text
General:        Panel, Calendario
Operaciones:    CRM, Clientes, Cotizaciones, Reservas, Contratos, Entregas, Devoluciones, Facturas
Flota:          Equipos, Mantenimiento, Daños
Inventario:     Refacciones
Administración: Actividad, Gastos Operativos, Bitácora, Reportes, Configuración, Datos Fiscales, Usuarios, Changelog, Ayuda
```

### Problemas identificados

1. **"Operaciones" tiene 8 items** — es el grupo más largo y mezcla el ciclo comercial (CRM → Cotización) con el ciclo operativo (Entregas → Devoluciones) y facturación.
2. **"Inventario" tiene solo 1 item** — no justifica un grupo propio, genera ruido visual.
3. **"Administración" mezcla** reportes/finanzas con configuración del sistema y ayuda.
4. **El orden dentro de Operaciones** no sigue el flujo natural del negocio (CRM aparece antes de Clientes, pero Facturas está al final lejos de Gastos).

### Propuesta: reorganizar en 5 grupos siguiendo el flujo del negocio

La lógica es: **ver resumen → vender → operar → mantener → administrar**.

```text
General
  Panel                  ← Vista general, siempre primero
  Calendario             ← Vista temporal de todo

Comercial               ← Ciclo de venta: prospecto → cliente → cotización → cierre
  CRM
  Clientes
  Cotizaciones
  Reservas

Operaciones             ← Ciclo operativo: contrato → entrega → devolución → cobro
  Contratos
  Entregas
  Devoluciones
  Facturas

Flota y Mantenimiento   ← Todo lo relacionado con los activos físicos
  Equipos
  Mantenimiento
  Daños
  Refacciones            ← Se absorbe aquí en vez de grupo "Inventario" separado

Administración          ← Finanzas, reportes y configuración del sistema
  Gastos Operativos
  Reportes
  Actividad
  Bitácora
  Configuración
  Datos Fiscales
  Usuarios
  Changelog
  Ayuda
```

### Justificación

| Decisión | Razón |
|---|---|
| Separar **Comercial** de **Operaciones** | Refleja las dos fases del negocio: vender y ejecutar. Reduce el grupo de 8 a 4+4. |
| **CRM → Clientes → Cotizaciones → Reservas** | Flujo natural: prospecto se vuelve cliente, se cotiza, se reserva. |
| **Contratos → Entregas → Devoluciones → Facturas** | Flujo post-venta cronológico: firmar → entregar → devolver → cobrar. |
| **Refacciones** dentro de Flota | Refacciones es inventario de la flota, no merece grupo propio. |
| Renombrar grupo a **"Flota y Mantenimiento"** | Más descriptivo del contenido. |
| **Gastos Operativos** y **Reportes** arriba en Administración | Son los más usados del grupo; configuración y ayuda van al final. |

### Cambios técnicos

Solo se modifica el array `navGroups` en `src/components/AppSidebar.tsx` y se agrega entrada al changelog. Sin cambios de rutas, roles ni componentes.

