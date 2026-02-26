
# Manual de Usuario v1.0 - Generado por IA

## Resumen

Crear una seccion de **Ayuda** en la app que contenga un manual de usuario completo generado por IA, con documentacion detallada de cada modulo, workflows paso a paso y ejemplos practicos. Se usara Lovable AI para generar el contenido del manual basado en el conocimiento de la app.

---

## Arquitectura

### Enfoque

1. **Edge function** `generate-manual` que usa Lovable AI para generar el contenido del manual en formato estructurado (JSON con secciones, subsecciones y contenido Markdown)
2. **Tabla en BD** `user_manual` para almacenar el manual generado (version, contenido JSON, fecha)
3. **Pagina `/help`** con interfaz de accordion por modulo, renderizando el contenido Markdown
4. **Boton "Regenerar Manual"** para admin que invoca la edge function y actualiza el contenido

### Por que este enfoque

- El contenido del manual se genera una vez y se guarda en BD, no se genera en cada visita
- El admin puede regenerar cuando haya cambios significativos
- El manual es accesible para todos los roles desde el sidebar

---

## Estructura del Manual (Prompt a la IA)

El prompt enviara a la IA el listado completo de modulos y funcionalidades de la app para que genere:

1. **Introduccion General** - Que es Lift Go, para quien es, conceptos clave
2. **Panel Principal** - Tarjetas de estadisticas, graficas, alertas
3. **Calendario** - Vista Gantt, vista lista, reservas por vencer
4. **Clientes** - Crear, editar, datos fiscales CFDI, exportar CSV
5. **Cotizaciones** - Flujo: crear → enviar → aceptar/declinar
6. **Reservas** - Crear reserva, vincular equipo, facturacion recurrente
7. **Contratos** - Crear, generar PDF con clausulas y anexos, plantilla editable
8. **Entregas y Recolecciones** - Programar, completar, vincular a reserva
9. **Devoluciones** - Inspeccion, condicion, costo de danos, factura post-inspeccion
10. **Facturas** - Crear, partidas, pagos, estados, generar recurrentes, exportar CSV
11. **Equipos (Flota)** - Agregar montacargas, especificaciones, estados, tarifa
12. **Mantenimiento** - Registrar servicio, mecanico, costo, proximo servicio
13. **Danos** - Seguimiento desde deteccion hasta reparacion y facturacion
14. **Reportes** - Utilizacion, ingresos, costos de mantenimiento, rentabilidad
15. **Configuracion** - Modelos de equipo, operadores, mecanicos, plantilla de contrato
16. **Datos Fiscales** - RFC, razon social, regimen fiscal, logo
17. **Usuarios** - Roles (admin, administrativo, dispatcher, mecanico, auditor), crear, eliminar
18. **Workflows Completos** - Flujo de renta de inicio a fin, flujo de facturacion

Cada seccion incluira:
- Descripcion del modulo
- Campos y su significado
- Pasos para las acciones principales
- Tips y notas importantes
- Workflows relacionados

---

## Cambios Tecnicos

### 1. Migracion SQL - Tabla `user_manual`

```sql
CREATE TABLE public.user_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL DEFAULT '1.0',
  content jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read manual"
  ON public.user_manual FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage manual"
  ON public.user_manual FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrativo'))
  );
```

### 2. Edge Function `generate-manual`

- Recibe una solicitud POST del frontend
- Construye un prompt detallado con la estructura completa de la app
- Llama a Lovable AI (google/gemini-2.5-flash) con tool calling para obtener JSON estructurado
- Guarda/actualiza el resultado en la tabla `user_manual`
- Retorna el contenido generado

El prompt incluira la lista de modulos, campos de cada formulario, estados posibles, y workflows clave, todo extraido del conocimiento que ya tenemos del codebase.

### 3. Hook `useUserManual`

- Query para leer el manual de la BD
- Mutacion para disparar la generacion via edge function

### 4. Pagina `HelpPage.tsx` en `/help`

- **Header**: "Manual de Usuario v1.0" con boton "Regenerar" (solo admin)
- **Barra de busqueda** para filtrar secciones
- **Accordion** con cada seccion del manual
- Cada seccion renderiza el contenido Markdown como HTML
- Estado de carga mientras se genera
- Mensaje si aun no hay manual generado, con boton para generar

### 5. Sidebar

- Nueva entrada "Ayuda" con icono `HelpCircle` en el grupo "Administracion", accesible para todos los roles

### 6. App.tsx

- Nueva ruta `/help` apuntando al componente HelpPage (sin restriccion de rol)

### 7. Changelog

- Entrada v3.3.0 con la nueva funcionalidad

---

## Archivos a crear/modificar

1. **Migracion SQL** - Crear tabla `user_manual`
2. **Crear** `supabase/functions/generate-manual/index.ts` - Edge function con Lovable AI
3. **Crear** `src/hooks/useUserManual.ts` - Hook para leer y generar
4. **Crear** `src/pages/HelpPage.tsx` - Pagina del manual con accordions
5. **Modificar** `src/components/AppSidebar.tsx` - Agregar entrada "Ayuda"
6. **Modificar** `src/App.tsx` - Agregar ruta `/help`
7. **Modificar** `src/lib/changelog.ts` - Agregar entrada v3.3.0

---

## Consideraciones

- **Costo**: La generacion del manual usa un solo llamado a Lovable AI. Se genera una vez y se guarda.
- **Fallback**: Si no hay manual generado, se muestra un mensaje con boton para generar.
- **Tiempo**: La generacion puede tomar 15-30 segundos. Se muestra un skeleton/spinner durante ese tiempo.
- **Busqueda**: Se implementa busqueda local sobre el contenido ya generado, sin llamadas adicionales a la IA.
- **Renderizado Markdown**: Se usara un parser simple de Markdown a HTML (regex basico para headers, listas, negritas, etc.) sin dependencias adicionales.
