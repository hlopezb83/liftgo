## Sistema de Feedback con Leaderboard

Un módulo nuevo para que cualquier usuario (interno o cliente del portal) reporte bugs y proponga mejoras. Los reportes válidos suman puntos y aparecen en una tabla de honor pública. Sin dinero, sin integraciones externas.

### Experiencia de usuario

**Botón flotante "Reportar"** visible en toda la app (esquina inferior derecha, tanto en `MainLayout` como `CustomerPortalLayout`). Al hacer clic abre un diálogo con:

- Tipo: Bug / Mejora
- Módulo afectado: dropdown con los ~25 módulos del ERP (Reservas, CRM, Flota, Mantenimiento, Facturación, etc.) Con el Módulo donde se encuentran como opción sugerida. Para clientes del portal, lista reducida (Mis Rentas, Mis Facturas, Mis Contratos, Dashboard, General).
- Severidad (solo bugs): Crítica / Alta / Media / Baja
- Título corto + descripción larga (Zod: 5–120 / 10–2000 chars)
- Screenshot opcional (drag-and-drop, reusa `DragDropImageUploader`)
- Auto-captura silenciosa: ruta actual, viewport, user agent, versión del changelog, user_id, timestamp en `America/Monterrey`

Confirmación con `sonner`: "Reporte enviado. ¡Gracias!" + número folio (FB-XXXX).

### Página de gestión `/feedback` (admin)

Kanban estilo Mantenimiento con columnas: **Nuevo → Triage → Aceptado → En Progreso → Resuelto → Cerrado / Rechazado**.

Click en una tarjeta abre un drill-down panel (patrón estándar del proyecto) con: descripción, contexto técnico capturado, screenshot, historial de cambios de estado, comentarios internos, y botones para mover de estado o asignar puntos al cerrar.

Filtros por: tipo, módulo, severidad, estado, autor.

### Página `/mis-reportes` (todos los usuarios)

Lista paginada (25 ítems vía `usePagination`) de los reportes del usuario logueado, con estado actual y puntos otorgados. En el portal de clientes vive en `/portal/mis-reportes`.

### Página pública `/leaderboard`

Tabla de honor visible para todos los usuarios autenticados (incluyendo portal):

- Top 20 contribuyentes del mes / del año / histórico (tabs)
- Columnas: Posición, Nombre, Reportes aceptados, Reportes resueltos, Puntos
- Medallas visuales para top 3 (oro / plata / bronce)
- Sin mostrar correos ni datos sensibles

### Reglas de puntuación

Definidas en código (`src/features/feedback/lib/scoring.ts`), no editables desde UI:

- Bug aceptado: +5
- Bug resuelto: +15 (severidad crítica ×2, alta ×1.5)
- Mejora aceptada: +3
- Mejora implementada: +10
- Reporte rechazado o duplicado: 0

Los puntos se asignan automáticamente al cambiar el estado vía RPC.

### Detalles técnicos

**Rutas:**

- `/feedback` — gestión admin (RoleGuard: admin/administrativo)
- `/mis-reportes` — historial propio
- `/leaderboard` — pública para autenticados
- `/portal/mis-reportes` — portal de clientes

**Tablas nuevas (Lovable Cloud):**

- `feedback_reports`: id, folio (FB-XXXX vía RPC `generate_doc_number`), reporter_id, reporter_type ('internal' | 'customer'), type ('bug' | 'improvement'), module, severity, title, description, screenshot_url, status, context_json (ruta, viewport, UA, app version), points_awarded, created_at, resolved_at
- `feedback_status_history`: id, report_id, from_status, to_status, changed_by, comment, changed_at
- `feedback_points`: vista materializada o RPC que agrega puntos por usuario/periodo

**RLS:**

- Internos ven sus propios reportes; admin/administrativo ven todos
- Clientes del portal ven solo los suyos (filtro por `customer_id` derivado de su sesión)
- Leaderboard expuesto vía RPC `SECURITY DEFINER` que devuelve solo nombre + puntos agregados (no expone PII)

**Storage:**

- Bucket nuevo `feedback-screenshots` (privado, lectura vía signed URLs en el panel admin)

**Captura de contexto:** hook `useFeedbackContext()` que lee `useLocation()`, `window.innerWidth/innerHeight`, `navigator.userAgent`, y `currentChangelogVersion` de `src/lib/changelog.ts`.

**Componentes nuevos** (todos ≤150 LOC, hooks ≤80 LOC, conformes a Power of 10):

- `FeedbackFab` (botón flotante)
- `FeedbackFormDialog` (formulario)
- `FeedbackKanban` + `FeedbackKanbanCard` + `FeedbackDetailSheet`
- `MyReportsPage` + `LeaderboardPage`
- Hooks: `useFeedbackReports`, `useCreateFeedback`, `useUpdateFeedbackStatus`, `useLeaderboard`, `useFeedbackContext`

**Navegación:** entradas nuevas en sidebar (`MainLayout`) bajo nueva sección "Comunidad": "Mis Reportes", "Leaderboard", "Gestión de Feedback" (admin). En `CustomerPortalLayout` agregar "Mis Reportes" y "Leaderboard".

**Numeración:** RPC `generate_feedback_number()` siguiendo el patrón existente de FAC-, COT-, CTR-.

**Permisos:** agregar `feedback:manage` a la matriz de roles (`useRolePermissions`) — solo admin/administrativo.

**Changelog:** entrada nueva v5.81.0 (minor) describiendo el módulo.

### Lo que NO incluye este plan

- No hay pagos monetarios ni tracking de bonos en MXN
- No hay notificaciones por email (todo dentro de la app)
- No hay integraciones externas (GitHub, Slack, Linear)
- No hay edición de reglas de puntuación desde UI
- No hay sistema de votación o duplicación inteligente (admin marca duplicados manualmente en v1)

Estas extensiones se pueden agregar después sin tocar el esquema base.

### Implementación por etapas

1. Migración SQL: tablas, RLS, RPC de numeración, RPC de leaderboard
2. Hooks de datos + tipo Zod + scoring
3. `FeedbackFab` + `FeedbackFormDialog` montados en ambos layouts
4. `/mis-reportes` + `/portal/mis-reportes`
5. `/feedback` (Kanban admin con drill-down y cambio de estados que asigna puntos)
6. `/leaderboard` con tabs y medallas
7. Entradas en sidebar + matriz de permisos
8. Memoria del proyecto (`mem://features/feedback`) + changelog v5.81.0

Tiempo estimado: una iteración mediana, sin dependencias externas ni configuración de secretos.