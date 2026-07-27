# Verificación visual — Sidebar Oleada 1 (v7.235.0 / v7.236.0)

**Analogía:** El menú del restaurante ya tiene el botón "+ Nuevo" y la carta se abre en el plato correcto, pero al mesero se le olvidan tres detalles: no ofrece "Nueva Reserva" ni a los admins, el foquito ámbar de "novedades" no se apaga después de leer el changelog, y no logré ver las etiquetas de "quedan N" (puede ser que hoy no haya pendientes o que estén rotas).

## Resumen de lo verificado (Playwright, viewport 1600x900, user admin)

| # | Componente | Estado | Evidencia |
|---|---|---|---|
| 1 | Badges de conteo (RPC único) | ⚠️ Sin evidencia visual | 3 llamadas a `get_sidebar_badge_counts` (una por navegación, staleTime OK), pero **ningún badge visible** en Entregas/Devoluciones/Mantenimiento/Facturas |
| 2 | Botón "+ Nuevo" | 🐞 Bug parcial | Se muestra y abre menú, pero **falta "Nueva Reserva"** para admin (solo se ven Cotización/Factura/Cliente) |
| 3 | Punto ámbar en Changelog | 🐞 Bug | El punto **sigue visible después de visitar `/changelog`** |
| 4 | Auto-scroll al ítem activo | ✅ OK | Al entrar directo a `/audit`, "Bitácora" queda visible al fondo |
| — | Consola | ✅ 0 errores | — |
| — | Versión visible en sidebar | ℹ️ `v7.235.0` | Puede ser cache de `version.json`; se esperaba `v7.236.0` |

## Fase 1 — Diagnóstico (sin cambios de código)

Antes de corregir, confirmar cada causa raíz:

1. **Badges invisibles.** Consultar los conteos reales en la BD:
   - `maintenance_logs` con `work_status NOT IN ('completed','cancelled')`
   - `deliveries` con `scheduled_date = CURRENT_DATE` y `status IN ('pending','scheduled')`
   - `bookings` con `status='confirmed'` y `end_date=CURRENT_DATE`
   - `customer_payment_intents` con `status='pending_review'`
   
   Si todos dan 0 → los badges están bien (no hay nada que mostrar). Si alguno > 0 → hay bug de render en `SidebarNavSection.tsx` (probable: `badgeKey` no matchea, o el `useQuery` no está resolviendo).

2. **Falta "Nueva Reserva" en +Nuevo.** Leer `SidebarQuickCreate.tsx` y `useUserRole`/`useRolePermissions` para ver por qué el filtro `adminOnly` excluye a un usuario con rol `admin` (screenshot muestra "ADMINISTRATIVO" como label — puede que el rol real sea `administrativo`, no `admin`).

3. **Punto ámbar persiste.** Leer `ChangelogPage.tsx` y `NavMenuItem` — verificar si `currentVersion` en el efecto de "marcar visto" coincide con el que compara el sidebar (posible mismatch entre `import.meta.env.VITE_APP_VERSION` y el que aparece en `public/changelog.json`).

## Fase 2 — Correcciones (una vez confirmadas causas)

- **Bug 2 — "Nueva Reserva" para admin:** ajustar `SidebarQuickCreate.tsx` para tratar tanto `admin` como `administrativo` (o el rol correcto según `AppRole`) en `adminOnly`.
- **Bug 3 — Punto ámbar:** unificar la fuente de `currentVersion` (usar el mismo helper `useCurrentVersion()` en ambos lados) y guardar la versión al montar `ChangelogPage`, no en un efecto dependiente.
- **Bug 1 (si aplica):** solo si el diagnóstico confirma `count > 0` sin badge → arreglar el render.

## Fase 3 — Re-verificación con Playwright

Repetir el flujo: dashboard → +Nuevo (esperar 4 opciones) → /audit (scroll) → /changelog (punto desaparece) → recarga (punto sigue apagado). Adjuntar screenshots.

## Fase 4 — Changelog + versión

- Nueva entrada patch en `public/changelog.json` + detalle (`v7.236.1` o `v7.236.2`).
- Confirmar que el sidebar muestre la versión nueva (revisar cache de `version.json`).

## Notas técnicas

- Auth de test: sesión inyectada (`LOVABLE_BROWSER_AUTH_STATUS=injected`), usuario `admin@lopezbenavides.com`.
- No se detectaron regresiones en el layout ni errores en consola.
- El RPC `get_sidebar_badge_counts` responde (network 200) — falta confirmar el payload.

¿Apruebas ejecutar Fase 1 (diagnóstico read-only en BD + lectura de 3 archivos) y luego avanzar a las correcciones?
