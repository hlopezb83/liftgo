

# Estado de mejoras del ERP

## ✅ Ya implementado (Quick Wins — v5.30.x)

| # | Mejora | Versión |
|---|---|---|
| #4 | Estado de cuenta PDF por cliente (+ rediseño premium) | 5.30.0 / 5.30.1 |
| #7 | Confirmaciones inteligentes al eliminar cliente | 5.30.0 |
| #9 | Forecast de cobranza en el Panel | 5.30.0 |
| #14 | Dark mode automático según sistema | 5.30.0 |

Adicional reciente (rondas anteriores): auditoría de rendimiento completa (v5.28-5.29), límite 500 filas en listas, RPCs para alertas de seguros, debounce en búsquedas, memoización de sidebar.

---

## 🔥 Pendientes del plan original (sin tocar)

**Fase 1 (alto impacto operativo):**
- #1 Notificaciones in-app + email (campanita en header, tabla `notifications`, edge function de envío)
- #2 Vista "Mi Día" para Despachador (`/today` con entregas, recolecciones y mantenimientos del día)
- #3 Recordatorios automáticos de cobranza (+3, +7, +15 días vía email al cliente)

**Fase 2 (productividad comercial):**
- #5 Acciones masivas en tablas (selección múltiple + bulk actions)
- #6 Pipeline Kanban de cotizaciones
- #8 Atajos de teclado en formularios (Ctrl+S, Esc, Ctrl+Enter)
- #10 Link público de cotización con aceptación de un click

**Fase 3 (diferenciadores):**
- #11 Exportación Excel formateada · #12 Comparativos período a período · #13 Mapa de equipos rentados · #15 Pago en línea desde portal · #16 PWA instalable · #17 QR en equipos · #18 Alertas predictivas de mantenimiento

**Fase 4 (escala):**
- #19 Conciliación bancaria CSV · #20 Modo offline para inspecciones

---

## 🎯 Mi recomendación: siguientes 3 a implementar

### **Recomendación A — Combo "Cobranza autónoma" (alto ROI inmediato)**
1. **#3 Recordatorios automáticos de cobranza** por email (+3/+7/+15 días vencida)
2. **#1 Notificaciones in-app** (al menos la campanita con eventos de cobranza, pagos recibidos y reservas por vencer)
3. **#9-bis Comparativos período a período** en KPIs del Dashboard

**Por qué:** Capitaliza el PDF de Estado de Cuenta y el Forecast recién entregados. La cobranza pasa de manual a semi-automática. Esfuerzo medio, ahorro de tiempo enorme para Administrativo.

### **Recomendación B — Combo "Productividad diaria"**
1. **#2 Vista Mi Día** para Despachador (concentra entregas/recolecciones/mantenimientos)
2. **#5 Acciones masivas** en tablas (envío masivo de recordatorios, exports parciales)
3. **#8 Atajos de teclado** en formularios (Ctrl+S, Esc, Ctrl+Enter)

**Por qué:** Pulen los flujos del día a día de los usuarios más activos (Despachador y Administrativo). Esfuerzo bajo-medio, percepción de fluidez muy alta.

### **Recomendación C — Combo "Cierre comercial moderno"**
1. **#10 Link público de cotización** con aceptación de un click (token público + página `/q/{token}`)
2. **#6 Pipeline Kanban de cotizaciones** con drag-and-drop
3. **#11 Exportación a Excel formateada** para reportes contables

**Por qué:** Acelera el cierre comercial y moderniza la experiencia que ve el cliente. Diferencia el producto frente a competencia.

---

## Mi voto

Recomiendo arrancar con la **Recomendación A — Cobranza autónoma**. Razones:
- Continúa la línea natural de los quick wins que acabamos de cerrar (Estado de Cuenta + Forecast)
- Ataca el dolor más caro del negocio: cuentas por cobrar olvidadas
- Los recordatorios automáticos por email aprovechan Lovable Emails que ya elegimos como proveedor
- Las notificaciones in-app sientan la base reutilizable para futuras alertas (mantenimiento, seguros, reservas)

¿Procedo con la **Recomendación A**, eliges otra, o armas tu propio combo de 2-3 items del listado?

