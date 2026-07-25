## Estado actual

Ya cerramos las 3 tandas gruesas del análisis (v7.230 → v7.232). Quedan **4 pendientes menores** + la verificación final.

## Analogía

Ya arreglamos el motor, la transmisión y las llantas. Falta cambiar el aceite, apretar dos tornillos y darle una vuelta de prueba.

## Pendientes

### 1. P1-4 (b) · Lista de /audit sin `old_data`/`new_data`
El trigger ya no guarda XML (v7.231.0), pero la **lista** de auditoría sigue trayendo los snapshots completos aunque solo se muestran en el detalle.
- Crear `AUDIT_LIST_COLUMNS` (sin `old_data`/`new_data`).
- El detalle re-descarga por id (patrón ya usado en facturas).

### 2. P3-10.3 · Dashboard no se invalida tras registrar pagos
Los KPIs (`overdue_total`, DSO) quedan desactualizados hasta 30s tras un pago.
- Añadir `["dashboard-financial-kpis"]` a `invalidateKeys` de `useCreatePayment` y `useUpdatePayment`.

### 3. P3-11 · Diálogos pesados aún en el shell
`FeedbackFormDialog` (cerrado por defecto) arrastra `react-day-picker` + `RHF+zod` al bundle inicial.
- Convertirlo a `lazy()` con `<Suspense fallback={null}>`.
- Verificar otros diálogos globales que sigan el mismo patrón (ej. GlobalSearch ya está OK).

### 4. Verificación final del análisis
- Rebuild con `ANALYZE=1` → confirmar que `recharts` salió del inicial y primer paint < 500 KB gz.
- Playwright: mount de `/fleet` debe hacer ≤ 3 requests (antes 6).
- Micro-bench: `dataVersion` < 1 ms/interacción con 500 filas.

## Fuera de alcance (documentado, no crítico)

- **P3-11 self-host Inter**: la app es ERP interno; Google Fonts con display=swap ya no es bloqueante.
- **P2-7 paginación server-side** para bookings/customers/quotes/maintenance/feedback: hoy topados a 500, "OK hoy" según el análisis.
- **P1-4 rewriting audit history**: intencionalmente no se re-escriben filas viejas (auditoría inmutable).

## Detalle técnico (para revisión)

| Item | Archivos afectados | Esfuerzo |
|---|---|---|
| P1-4 (b) | `src/features/audit/hooks/*`, agregar columnas explícitas | ~20 líneas |
| P3-10.3 | `src/features/payments/hooks/usePaymentMutations.ts` | 2 líneas |
| P3-11 | `src/layouts/*` o donde monte `FeedbackFormDialog` | ~5 líneas |
| Verificación | Playwright + `bun run build -- --mode analyze` | 1 script |

## Bump de versión sugerido

`v7.233.0` (minor) — última tanda de performance + verificación. Se actualiza `public/changelog.json`, `public/changelog/v7.233.0.json` y `package.json`.
