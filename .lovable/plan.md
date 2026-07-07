# Plan: Cerrar hallazgos pendientes de la auditoría de toasts

Continuación de la auditoría documentada en `docs/audits/toasts-2026-06-23.md` y la fase HIGH ya ejecutada en v6.108.0. Cubre los hallazgos MEDIUM/LOW restantes.

## Alcance

### 1. MEDIUM — Enriquecer `notifyError` con el objeto `error` (~6 sitios)
Actualmente pasan sólo `{ message }` en flujos que sí tienen un error del backend, lo que rompe el reporte estructurado ("Ver detalles" queda vacío).

Archivos objetivo (a confirmar con `rg` al inicio):
- `src/features/quotes/hooks/useQuoteBookingCreator.ts` (~L62)
- `src/features/audit/hooks/useAuditLogs.ts` (~L92)
- Barrido con `rg "notifyError\(\{\s*message" src` para localizar el resto y decidir caso por caso si es validación (→ `notifyValidation`) o error real (→ agregar `error: err`).

Cambio típico:
```ts
// antes
notifyError({ message: "No se pudo crear la reserva" });
// después
notifyError({ error: err, message: "No se pudo crear la reserva" });
```

### 2. MEDIUM — Anotar/convertir `catch {}` silenciosos (20 ocurrencias)
Para cada `catch {}` en `src/**` (excluyendo tests):
- Si es defensivo legítimo (parseo opcional, screenshot, `localStorage`): agregar comentario `// silent: <razón breve>`.
- Si oculta un fallo visible para el usuario: convertir a `notifyWarning({ error: err, message: "..." })` o `notifyError` según severidad.

Se hará una pasada con `rg -n "catch\s*\{\s*\}" src` y clasificación inline en el PR.

### 3. LOW — Piloto de `notifyAsync` en flujos largos
Aplicar `notifyAsync` (toast.promise) en 2–3 flujos con latencia perceptible y sin UI de loading dedicada:
- Timbrado CFDI (`useStampCfdi`) — reemplaza `notifySuccess` en `onSuccess` + `notifyError` en `onError` por una sola llamada `notifyAsync`.
- Generación recurrente manual (si aplica desde UI).
- Import de CSF (`parse-csf`) cuando se dispare desde `CsfDropzone`.

Criterio: sólo donde no exista ya un spinner/skeleton específico, para no duplicar feedback.

### 4. LOW — Consolidar traducciones de dominio en `errorCatalog.ts`
Mover los mapeos actualmente dispersos (`translateFacturapiError`, patrones CFDI, mensajes de recurring billing) a un registro central indexado por `ErrorCode`, y que `getErrorMessage` los use como capa antes del regex genérico.

No cambia comportamiento visible; deja base para i18n futura.

### 5. Documentación y cierre
- Actualizar `docs/audits/toasts-2026-06-23.md` marcando los hallazgos MEDIUM/LOW como resueltos con la versión correspondiente.
- Nueva entrada en `public/changelog.json` + `public/changelog/v6.109.0.json` (minor, describe las 4 secciones).

## Fuera de alcance
- Refactor de strings de éxito con `feedbackMessages.ts` (trabajo incremental documentado en la auditoría original).
- Cambios visuales al `<Toaster>` (Hallazgo #10, se decidió no tocar para evitar regresión).
- Los 2 `toast.error` legítimos en `ErrorDetailsDialog.tsx` (documentados como excepción).

## Verificación
- `bunx vitest run` verde (esperado 722+ tests).
- `rg "notifyError\(\{\s*message[^,}]*\}\s*\)" src` → 0 resultados fuera de casos justificados.
- `rg "catch\s*\{\s*\}" src` → todos con comentario `// silent:` o migrados.
- Smoke manual: timbrar una factura de prueba y verificar toast único con estados loading/success/error.

## Detalles técnicos

- `notifyAsync` firma actual en `src/lib/ui/appFeedback.ts` — revisar antes de cablear (posible ajuste para aceptar `getReport` para el reject).
- `errorCatalog.ts` ya existe con `ERROR_CODES`; falta la tabla de traducciones. Agregar `translateByCode(code, ctx?)` y hacer que edge functions devuelvan `code` en el payload de error cuando aplique.
- Los tests de `useStampCfdi` requerirán mockear `notifyAsync` en vez de success/error separados.
