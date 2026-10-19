# N5: contenido del calendario durante la navegación pendiente

Base publicada de PR 276: `cbdbb631d4338704e328a13b652587eac97c8b1b`, runtime reportado `8.44.8`. La integración parte de esa base, en una rama separada; no modifica PR 276 ya fusionado.

Fuente QA leída: `qa-pr276-published-n5.json`, SHA-256 `902830D7EA5B927E40971CC677E24C3013D6824A3C20DC9257DCB7ADAE117B27`. QA observó el salto noviembre→octubre en la primera entrada de escritorio. En móvil el detalle ya estaba en caché y no se observó esa transición. Los estados móviles de este documento son reproducciones offline con una ruta deliberadamente pendiente, no nuevas observaciones del navegador publicado.

## Causa y alcance

Las guardas de PR 276 impiden escribir parámetros del calendario en la URL de destino, pero `useCalendarLocationState` sigue derivando `currentDate`, `viewMode` y `ganttRange` de los parámetros globales del destino. TanStack mantiene montada la página saliente mientras termina la carga de una ruta hermana. Cuando el destino carece de parámetros del calendario, el hook usa la sesión capturada **al montar**, anterior a la consulta de noviembre. Por ello la página visible cambia a octubre; en la rama móvil también cambia de Gantt a Lista.

La reproducción conserva la URL limpia, la sesión de noviembre y el retorno correcto ya arreglados por PR 276. El defecto restante es el contenido saliente. El padre conserva el último conjunto de parámetros propios del calendario y lo usa fuera de la ruta y al reabrirla sin parámetros; una URL explícita nueva debe prevalecer. Las guardas de escritura anteriores permanecen.

## Prueba real y estados conservados

`CalendarPage.pending-navigation.test.tsx` mantiene TanStack, historia en memoria, CalendarPage, toolbar, GanttCard/GanttRow, BookingDetail y DetailPageHeader reales. Sólo simula datos, widgets ajenos y la envoltura de datos del gráfico. No simula `navigate`. Un loader controlado mantiene visible la página saliente antes de resolver el detalle o Panel. La rama `useIsMobile` se selecciona mediante fixture; no es una captura de píxeles de viewport.

Los diez casos verifican ambos modos de viewport:

1. Noviembre/Gantt/Mes → reserva pendiente → detalle correcto → Volver.
2. Noviembre/Gantt/Mes → Panel pendiente → Panel limpio.
3. Cancelar el detalle pendiente reabriendo `/calendar` **sin parámetros**, sin desmontar el encabezado original.
4. Reabrir una URL explícita de diciembre/Lista/Mes, que debe dominar el estado retenido.
5. Noviembre/Lista/Semana → Panel pendiente, conservando literalmente el rango visible y las pestañas.

`before-snapshots.json` contiene **36 estados intermedios y finales** con datos sintéticos. Guarda URL, encabezados, periodo, rango visible, pestañas, indicador de carga y sesión del calendario. No contiene registros ni UUID reales del QA. El identificador de reserva de fixture es `bk-november`.

| Evidencia | Resultado |
| --- | --- |
| `before-visual.txt` en la base publicada | **10 pruebas fallan**, por cambio visual o retorno bare a octubre. Las comprobaciones previas de URL/origen permanecen correctas. |
| `after-visual.txt` con parche del padre | **10/10 pasan**; mismos casos y archivo, con 36 estados sintéticos en `after-snapshots.json`. |
| `after-with-regressions.txt` con parche del padre | Ejecución conjunta de los diez casos y las 26 regresiones de calendario/reserva/router y la activación repetida: **37/37 pasan / 5 archivos**. |
| `lint.txt` | ESLint global: **exit 0**, con un aviso del emisor de snapshots corregido; `lint-final-delta.txt` confirma los cuatro archivos finales sin avisos. |
| `typecheck.txt`, `build.txt`, `changelog.txt` | Tipos, build cliente/SSR y changelog: **exit 0**. Candidata 8.44.10. |
| `test-source-sha256.txt` | Identidad del archivo final usado en el baseline. |

La referencia final es `before-visual.txt`; su helper de Lista/Semana lee el texto real de la barra, sin asumir el carácter del guion ni recalcular fechas. Un intento inicial del helper no encontraba el rango de Lista y se corrigió antes de la comparación final; ese intento no se cuenta como fallo del producto.

## Comandos

```powershell
$env:TEMP = Join-Path (Get-Location) 'docs/audits/2026-10-18/calendar-visual-followup/.tmp'
$env:TMP = $env:TEMP
$env:LIFTGO_AUDIT_SNAPSHOTS = '1'
node node_modules/vitest/vitest.mjs run src/features/calendar/pages/__tests__/CalendarPage.pending-navigation.test.tsx --maxWorkers=1
node node_modules/eslint/bin/eslint.js src/features/calendar/pages/__tests__/CalendarPage.pending-navigation.test.tsx
```

La emisión `N5_VISUAL_SNAPSHOT` sólo se activa con la variable de auditoría. Los JSON son una extracción literal de esas líneas del log. El integrador editó el hook y ejecutó las verificaciones locales. Una revisión independiente no encontró bloqueadores en el delta. Sin Chrome, BD, publicación, fusión o cambios de permisos. Esta prueba DOM no acredita píxeles, peticiones reales ni QA publicado; el coordinador realiza el QA posterior.

## Activación repetida durante la carga

Un caso adicional separado reproduce un segundo clic sobre la misma reserva visible durante el loader: el origen correcto se sustituía por `/bookings/bk-november` y Volver terminaba en `/bookings`. `before-double-activation.txt` conserva ese fallo antes. GanttRow ahora ignora activaciones cuando la ruta activa ya dejó de ser `/calendar`; el primer clic y el teclado en el calendario siguen iguales. El caso pasa dentro de `after-with-regressions.txt`, con cinco estados en `after-double-activation-snapshots.json`. No se cambia diseño, rango ni transiciones de estatus.

Los logs de pruebas publicados están saneados de rutas personales y espacios finales; se conserva su contenido de fallos/estados/resultados. `build.txt` es un resumen con hash de la salida local completa.
