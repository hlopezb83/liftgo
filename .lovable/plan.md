
# Rediseno del Calendario de Disponibilidad

## Resumen

Redisenar la pagina de calendario para que sea mas clara y util. Se agregan tarjetas resumen, se mejora el Gantt con barras con nombre, se agrega vista semanal, y se agrega vista de lista expandible por equipo.

---

## 1. Tarjetas resumen en la parte superior

Debajo del encabezado y las alertas, mostrar 4 tarjetas compactas:

- **Disponibles**: cantidad de equipos con status "available" y sin reserva activa hoy
- **Rentados**: cantidad de equipos con status "rented" o con reserva confirmada activa hoy
- **En Mantenimiento**: cantidad de equipos con status "maintenance"
- **Utilizacion**: porcentaje de flota activa (rentados / total activos)

Se reutiliza el componente `StatCards` existente del dashboard.

---

## 2. Barras Gantt con nombres de cliente

En vez de pintar cuadro por cuadro por dia, se calculan "segmentos" de reserva que cruzan el rango visible y se renderizan como barras horizontales con `position: absolute` sobre la fila del montacargas.

Cada barra:
- Muestra el nombre del cliente en texto pequeno si la barra tiene suficiente ancho (mas de 3 dias)
- Conserva el tooltip con detalles completos
- Usa el mismo sistema de colores por cliente (no por booking ID, se cambia para que sea por cliente)
- Las reservas no confirmadas se muestran con borde punteado y opacidad reducida

---

## 3. Vista semanal

Agregar un selector de vista (Semana / Mes) en el encabezado del Gantt.

- **Vista mensual**: igual que ahora pero con barras mejoradas
- **Vista semanal**: muestra solo 7 dias, con columnas mas anchas, permitiendo ver nombres de cliente mas facilmente y mejor detalle dia a dia

El selector se implementa con Tabs junto a los controles de navegacion.

---

## 4. Vista de lista por equipo

Agregar una tercera pestana de vista: "Lista". Muestra cada montacargas como un item expandible (Collapsible) que al abrirse muestra:

- Reserva activa actual (si existe), con cliente, fechas, y duracion
- Proximas reservas ordenadas por fecha
- Status del equipo
- Indicador si tiene mantenimiento proximo

Esto es util para ver rapidamente la agenda de un equipo especifico sin interpretar el Gantt.

---

## Cambios tecnicos

### Archivo principal modificado
- `src/pages/CalendarPage.tsx` — refactorizacion completa

### Archivos nuevos (componentes extraidos)
- `src/components/calendar/CalendarStatCards.tsx` — tarjetas resumen
- `src/components/calendar/GanttChart.tsx` — Gantt con barras y soporte semana/mes
- `src/components/calendar/EquipmentListView.tsx` — vista de lista expandible

### Logica de colores
Se cambia `hashColor` para asignar colores por **customer_name** en vez de por booking ID, de forma que todas las reservas del mismo cliente tengan el mismo color en el Gantt.

### Estructura de CalendarPage

```text
CalendarPage
  PageHeader (sin cambios)
  AlertCard (reservas por vencer, sin cambios)
  CalendarStatCards (nuevo)
  Card con Gantt
    Header: titulo mes + selector vista [Semana|Mes] + navegacion
    GanttChart (refactorizado)
      - Calcula posiciones absolutas de barras
      - Renderiza nombre de cliente dentro de la barra si cabe
      - Soporte para rango semanal o mensual
  EquipmentListView (nuevo, alternativa al Gantt)
  Card de Reservas (sin cambios)
```

### Navegacion de vistas

Se usa un estado `viewMode` con valores `"gantt"` y `"list"`. Un segundo estado `ganttRange` con valores `"week"` y `"month"` controla el zoom del Gantt.

```text
[Gantt] [Lista]          <- viewMode
         |
    [Semana] [Mes]       <- ganttRange (solo visible en modo Gantt)
```

### Calculo de barras Gantt

Para cada montacargas, se filtran las reservas que intersectan el rango visible. Para cada reserva se calcula:
- `startCol`: max(booking start, range start) como indice de dia
- `endCol`: min(booking end, range end) como indice de dia
- `leftPercent`: startCol / totalDays * 100
- `widthPercent`: (endCol - startCol + 1) / totalDays * 100

Esto permite posicionar la barra con CSS `left` y `width` en porcentaje dentro de un contenedor `relative`.
