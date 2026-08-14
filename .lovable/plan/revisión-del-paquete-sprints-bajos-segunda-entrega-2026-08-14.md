# Revisión del paquete `sprints_bajos` (segunda entrega)

Este archivo es el mismo paquete de sprints B1, B2 y B3 que ya se aplicó en las versiones v7.327.0 – v7.329.1. Se verificó parche por parche contra el código actual.

## Estado verificado

- 29 de 30 parches ya están aplicados en el repositorio (verificado con `patch --dry-run`: "reversed / already applied" o archivo ya eliminado).
- Casos que reportaban "fallo" son en realidad implementaciones equivalentes ya presentes:
  - B1-06 (Costo Real $0): hoy se resuelve con el helper `shouldShowActualCost(...)` en `DamageDetailSheet.tsx`.
  - B2-F11 (columnas del portal de pagos): `PORTAL_PAYMENT_COLUMNS` ya existe y se usa en `useCustomerPortal.ts`.
  - B3-04 (factura no encontrada): `InvoiceNotFound` ya existe en `PortalInvoicePayment.tsx`.
  - B1-01 (índice FK `documents.uploaded_by`): el propio documento indica que no aplica; el índice parcial ya existe.
- Único parche pendiente: **B1-02 `.env` untrack**.

## Recomendación sobre el único pendiente

No aplicarlo. En este proyecto el archivo `.env` es generado y administrado por la plataforma (Lovable Cloud): contiene solo la URL del backend, el ID de proyecto y la llave publicable (`anon`), que es pública por diseño y está protegida por RLS. No hay secretos privados ahí. Borrarlo rompería el arranque local y la plataforma volvería a regenerarlo.

## Trabajo propuesto

1. No se modifica código de la app (todo ya está implementado).
2. Registrar la verificación en el changelog como entrada **patch v7.330.1** con título "Verificación paquete sprints_bajos (reentrega)" y descripción del resultado (29/30 aplicados, `.env` descartado por diseño de plataforma).
3. Actualizar el archivo MD de changelog con la misma entrada.

Si prefieres que sí se quite `.env` del control de versiones, dilo y lo incluyo como paso adicional (requiere ajuste de `.gitignore` y documentar el flujo `cp .env.example .env`).
