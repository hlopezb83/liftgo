

Voy a hacer una auditoría UX/funcional desde la perspectiva de los usuarios finales del ERP (Admin, Ventas, Despachador, Mecánico, Administrativo). Primero exploro áreas clave que aún no he revisado a fondo.

## Perfiles de usuario a considerar
1. **Despachador** — coordina entregas/recolecciones diarias
2. **Ventas** — cotiza, convierte prospectos, cierra reservas
3. **Mecánico** — ejecuta y registra mantenimientos
4. **Administrativo** — factura, cobra, concilia
5. **Admin/Director** — toma decisiones con KPIs

---

# Mejoras propuestas — LiftGo

## A. Productividad diaria (alto impacto)

### A1. **Vista "Mi día" para Despachador**
Hoy el despachador debe abrir Calendario + Entregas + Devoluciones por separado. Crear `/today` con: entregas de hoy, recolecciones de hoy, mantenimientos programados, alertas de seguros — todo en una pantalla con acciones rápidas (marcar entregado, asignar chofer).

### A2. **Notificaciones in-app y por email**
No existe sistema de notificaciones. Casos críticos:
- Factura vencida → Administrativo
- Mantenimiento próximo (cada X horas) → Mecánico
- Reserva por vencer (3 días) → Ventas
- Seguro por expirar → Admin
- Pago recibido → Ventas (cliente que cerró)

Implementar tabla `notifications` + bell icon en header + edge function para emails.

### A3. **Búsqueda global mejorada (Ctrl+K)**
Existe el atajo pero conviene auditar cobertura: ¿busca en folios FAC-, COT-, RSV-, CTR-, ENT-, DEV-, clientes, equipos por serie? Agregar resultados agrupados con preview.

### A4. **Acciones masivas (bulk actions)**
En tablas grandes (Facturas, Clientes, Reservas) no se pueden seleccionar múltiples filas. Casos: enviar recordatorio masivo de cobro, exportar CSV de selección, cancelar varias cotizaciones expiradas.

---

## B. Comercial / Ventas

### B1. **Pipeline visual de cotizaciones**
Hoy son tabla. Agregar vista Kanban (Borrador → Enviada → Aceptada → Convertida/Rechazada) similar al CRM, con drag-and-drop para cambiar estado.

### B2. **Plantillas de cotización rápida**
Para clientes recurrentes que rentan el mismo equipo: botón "Duplicar última cotización" desde ficha del cliente.

### B3. **Recordatorios automáticos de seguimiento**
Cotización enviada hace 3 días sin respuesta → tarea automática para vendedor.

### B4. **Firma electrónica en contratos** ✅ ya existe (SignaturePad) — verificar que esté en flujo cliente, no solo interno.

### B5. **Link público de cotización**
Token único para enviar al cliente sin que tenga que crear cuenta. Cliente acepta con un click → cotización pasa a "Aceptada" automáticamente.

---

## C. Operaciones / Flota

### C1. **Mapa de ubicación de equipos**
Existe `useForkliftMap` pero no veo página dedicada. Vista de mapa con pines de equipos rentados (dirección del cliente) — útil para logística y recolecciones.

### C2. **Checklist digital de entrega/devolución en móvil**
El despachador debería poder completar la inspección desde tablet/celular en sitio: fotos, horómetro, daños, firma del cliente. Verificar que `ReturnInspection` esté optimizado para móvil táctil.

### C3. **Lectura de horómetro con foto/OCR**
En vez de capturar a mano, foto del display con campo numérico al lado. Podría usar Lovable AI para OCR.

### C4. **Alertas predictivas de mantenimiento**
Combinar horómetro actual + política de mantenimiento + horas/día promedio = "este equipo necesitará servicio en ~7 días". Notificar a Mecánico con anticipación.

### C5. **Códigos QR en equipos**
Cada forklift con QR físico que abre su ficha. Mecánico escanea → registra mantenimiento sin buscar.

---

## D. Cobranza / Finanzas

### D1. **Recordatorios automáticos de cobranza**
Factura vencida +3, +7, +15 días → email automático al cliente con link a portal y PDF adjunto. Hoy `CollectionNotesCard` es manual.

### D2. **Estado de cuenta por cliente**
PDF descargable con todas las facturas pendientes, pagos aplicados, saldo total. Botón en `CustomerDetailPage`.

### D3. **Conciliación bancaria simplificada**
Importar CSV/XML de banco → matching automático contra pagos pendientes por monto + fecha aproximada.

### D4. **Forecast de cobranza**
Widget en Dashboard: "Esperado cobrar esta semana: $X" basado en facturas con vencimiento próximo y comportamiento histórico del cliente.

### D5. **Complemento de pago CFDI**
Verificar si está implementado. Es obligatorio en México para pagos en parcialidades.

---

## E. UX / UI específicas

### E1. **Estados de carga más granulares**
Hoy se usa `Skeleton` global. Para mutaciones (guardar, eliminar) agregar feedback inline en el botón mismo además del toast.

### E2. **Confirmaciones más inteligentes**
"¿Eliminar cliente?" debería mostrar: "Tiene 3 reservas activas y $45,000 en facturas pendientes. ¿Continuar?" — no solo confirmación genérica.

### E3. **Vista compacta vs cómoda**
Toggle global de densidad de tablas (ya son compactas, pero algunos usuarios prefieren más aire). Persistir en localStorage por usuario.

### E4. **Dark mode**
Ya existe la infraestructura de tokens. Agregar toggle. Útil para uso prolongado.

### E5. **Atajos de teclado en formularios**
`Ctrl+S` guardar, `Esc` cancelar, `Ctrl+Enter` guardar y nuevo. Hoy todo es click.

### E6. **Onboarding interactivo**
Para nuevos usuarios: tour guiado de primer login (5 pasos clave). Reducir curva de aprendizaje.

### E7. **Empty states accionables**
Verificar que cada lista vacía tenga CTA claro: "No hay reservas → [Crear primera reserva]".

---

## F. Reportes y BI

### F1. **Exportación a Excel además de CSV**
Con formato (colores, totales en negrita, fórmulas) usando `xlsx`. Más útil para contadores.

### F2. **Reporte de rentabilidad por cliente**
Existe `useCustomerProfitability` — verificar que esté expuesto en UI con drill-down.

### F3. **Comparativos período a período**
"Ingresos este mes vs mes anterior vs mismo mes año pasado" en KPIs del Dashboard.

### F4. **Reportes programados por email**
Admin recibe Estado de Resultados cada lunes automáticamente.

---

## G. Portal del Cliente (mejoras)

### G1. **Cliente puede solicitar extensión de renta** desde el portal → genera tarea para Ventas.
### G2. **Cliente puede reportar incidencia/daño** con fotos desde portal.
### G3. **Cliente paga en línea** (Stripe/Mercado Pago) → genera pago automáticamente.
### G4. **Descarga de XML CFDI** desde el portal (hoy solo PDF).

---

## H. Móvil / Campo

### H1. **PWA instalable**
Configurar manifest + service worker básico para que despachadores y mecánicos lo instalen como app en su celular. Funciona offline para consultas.

### H2. **Modo offline para inspecciones**
Captura de inspección sin conexión, sincroniza al recuperar señal. Crítico para choferes en zonas sin cobertura.

---

## Plan priorizado

| # | Mejora | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 1 | Notificaciones in-app + email (A2) | Muy alto | Alto | 🔥 |
| 2 | Vista "Mi día" para Despachador (A1) | Alto | Medio | 🔥 |
| 3 | Recordatorios automáticos de cobranza (D1) | Alto | Medio | 🔥 |
| 4 | Estado de cuenta por cliente PDF (D2) | Alto | Bajo | 🔥 |
| 5 | Acciones masivas en tablas (A4) | Alto | Medio | ⭐ |
| 6 | Pipeline Kanban de cotizaciones (B1) | Medio | Medio | ⭐ |
| 7 | Confirmaciones inteligentes (E2) | Medio | Bajo | ⭐ |
| 8 | Atajos de teclado en formularios (E5) | Medio | Bajo | ⭐ |
| 9 | Forecast de cobranza en Dashboard (D4) | Medio | Bajo | ⭐ |
| 10 | Link público de cotización con aceptación (B5) | Alto | Medio | ⭐ |
| 11 | Exportación a Excel formateado (F1) | Medio | Bajo | 💡 |
| 12 | Comparativos período a período (F3) | Medio | Bajo | 💡 |
| 13 | Mapa de equipos rentados (C1) | Medio | Medio | 💡 |
| 14 | Dark mode (E4) | Bajo | Bajo | 💡 |
| 15 | Cliente paga en línea desde portal (G3) | Alto | Alto | 💡 |
| 16 | PWA instalable (H1) | Medio | Bajo | 💡 |
| 17 | Códigos QR en equipos (C5) | Medio | Bajo | 💡 |
| 18 | Alertas predictivas de mantenimiento (C4) | Medio | Medio | 💡 |
| 19 | Conciliación bancaria CSV (D3) | Alto | Alto | 🔮 |
| 20 | Modo offline para inspecciones (H2) | Medio | Alto | 🔮 |

**Recomendación de fases:**
- **Fase 1 (impacto inmediato):** #1-4 — resuelven dolores diarios de cobranza y operación
- **Fase 2 (productividad):** #5-10 — pulen flujos comerciales y de tablas
- **Fase 3 (diferenciadores):** #11-18 — features que elevan percepción del producto
- **Fase 4 (escala):** #19-20 — proyectos grandes para versión futura

¿Quieres que implemente la **Fase 1** completa, o prefieres elegir items específicos del listado?

