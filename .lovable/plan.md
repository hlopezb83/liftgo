## Cómo corregir los 177 warnings de ESLint

Los warnings actuales (log CI adjunto) se agrupan en pocas familias. Cada una tiene su propia estrategia y riesgo — por eso los meto en 3 olas incrementales, cada una mergeable por separado.

### Inventario (por regla)

| # | Regla | Familia | Estrategia |
|---|---|---|---|
| 85 | `import-x/order` | Orden de imports | Autofix (`eslint --fix`) |
| 27 | `react-hooks/refs` | Acceso a `ref.current` en render | Mover a `useEffect`/handlers |
| 24 | `react-hooks/set-state-in-effect` | `setState` dentro de `useEffect` | Derivar en render o mover a event handler |
| 9 | `react-refresh/only-export-components` | Archivo exporta componente + no-componente | Separar en 2 archivos |
| 6 | `react-hooks/incompatible-library` | Librería incompatible con React Compiler | Envolver en `useMemo` / `"use no memo"` |
| 5 | `playwright/no-skipped-test` | Tests con `test.skip` | Reactivar o eliminar |
| 2 | `react-compiler/react-compiler` | Mutación inválida | Refactor a inmutable |
| ≤3 | `max-lines-per-function`, `jsx-a11y/no-autofocus`, `playwright/no-wait-for-timeout`, `react-hooks/purity`, `react-hooks/static-components` | Varios | Fix puntual |

### Ola 1 — Autofix + quick wins (v7.114.2, riesgo bajo)

- Correr `bunx eslint . --fix` para resolver los **85 `import-x/order`** y cualquier warning auto-fixeable restante.
- Arreglar los 5 `playwright/no-skipped-test` (auditar y decidir: reactivar o borrar el test).
- Arreglar `jsx-a11y/no-autofocus` y `playwright/no-wait-for-timeout` (1 cada uno) — cambios triviales.
- Validar: `bun run lint` + `bunx vitest run`.
- **Reducción esperada:** ~92 warnings → quedan ~85.

### Ola 2 — React Hooks: setState-in-effect (v7.114.3, riesgo medio)

Los 24 `set-state-in-effect` casi siempre son uno de estos patrones:

1. **Derivar en render** en vez de sincronizar con effect. Ej: `useState + useEffect(() => setX(computeFrom(props)))` → `const x = useMemo(() => computeFrom(props), [props])`.
2. **Mover a event handler** cuando la actualización responde a una acción del usuario.
3. **`useSyncExternalStore`** cuando sincronizamos con un store externo.

Auditar los 24 casos uno por uno; cada uno requiere leer el archivo. Los archivos ya listados en el log incluyen `BankReconciliationPage`, `usePaymentSelection`, `useSupplierBillForm`, etc.

- **Reducción esperada:** ~24 warnings → quedan ~61.
- **Riesgo:** Cambiar effects mal puede alterar timing/render. Cubrir cada archivo tocado con un test si no lo tiene ya.

### Ola 3 — Refs + React Compiler + refactor (v7.114.4, riesgo medio-alto)

- **27 `react-hooks/refs`**: mover accesos `ref.current` fuera de render (a `useEffect` o handlers). En algunos casos es callback-ref.
- **9 `react-refresh/only-export-components`**: partir cada archivo señalado en `Component.tsx` + `componentHelpers.ts` (constantes, hooks, tipos). Cambio mecánico pero toca imports en muchos sitios.
- **6 `react-hooks/incompatible-library`**: envolver invocaciones a librerías no-puras (`jspdf`, `xlsx`, etc.) en `useMemo` o marcar el archivo con `"use no memo"` como último recurso.
- **2 `react-compiler/react-compiler`**: refactor a inmutable (spread en lugar de `array.push`).
- **1 `max-lines-per-function`** (`AuditTrailPage`, 151/150 líneas): extraer un sub-componente.
- **Reducción esperada:** los ~61 restantes bajan a 0.

### Validación por ola

1. `bun run lint` → menos warnings que la ola anterior, 0 errors siempre.
2. `bunx vitest run` → 1083/1083 verde.
3. `bunx tsgo --noEmit` → sin errores nuevos.
4. Push → CI verde.

### Anti-patrones que voy a evitar

- `// eslint-disable` masivos: sólo aceptables para reglas de compiler cuando la librería objetivamente no es compatible (`"use no memo"` con comentario justificando).
- Cambiar reglas del `.eslintrc` para "silenciar" — el objetivo es cero warnings, no cero reglas.

### Cronograma sugerido

Puedo empezar hoy mismo por **Ola 1** (autofix + quick wins) que es la de mayor impacto y menor riesgo. Ola 2 y 3 en turnos separados con revisión intermedia. ¿Arranco?
