

## Plan: Filtrar solo reservas terminadas en formulario de devolución (v3.19.8)

### Problema
El formulario de nueva devolución muestra todas las reservas confirmadas sin importar si su periodo ya terminó. El usuario quiere que solo aparezcan reservas cuya `end_date` ya pasó.

### Cambios

**1. `src/pages/ReturnInspectionPage.tsx`**
- Cambiar el filtro de `activeBookings` de:
  ```ts
  bookings?.filter((b) => b.status === "confirmed" && !b.return_status)
  ```
  a:
  ```ts
  bookings?.filter((b) => b.status === "confirmed" && !b.return_status && new Date(b.end_date) <= new Date())
  ```
- Agregar un mensaje informativo debajo del dropdown:
  > "Solo se muestran reservas cuyo periodo de renta ha finalizado. Si no encuentras la reserva que buscas, verifica que la fecha de fin ya haya pasado o edita la reserva para ajustar las fechas antes de registrar la devolución."

**2. `src/lib/changelog.ts`** — v3.19.8

### Archivos
- **Editar**: `ReturnInspectionPage.tsx`, `changelog.ts`

