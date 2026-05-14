## Adopción de "Power of 10" en LiftGo

### Por qué sí

Formaliza principios que ya seguimos implícitamente y le da a la IA una checklist explícita contra la cual auto-evaluar cada PR. Reduce regresiones y discusiones sobre estilo.

### Calibraciones necesarias (vs. texto original)

| Regla | Original | Calibrada para LiftGo | Motivo |
|---|---|---|---|
| 4 | ≤100 líneas por componente | **≤150 líneas componentes / ≤80 hooks** | Pages como `InvoiceForm`, `ContractForm` no caben en 100 sin fragmentar artificialmente. |
| 9 | ≤2 niveles de prop drilling | **≤3 niveles** o composición | Patrón table → row → action es legítimo. |
| 2 | `.limit()` en toda query | **Límite server-side O paginación client-side documentada** | `usePagination` (25 ítems) ya cubre el caso UI; queries traen hasta 500. |

Las otras 7 se adoptan sin cambios.

### Entregables

**1. Documento maestro: `architecture.md` (sección nueva)**
Agregar sección "## Principios de Desarrollo (Power of 10)" con las 10 reglas calibradas, ejemplos `bueno/malo` específicos del proyecto (Supabase queries, useEffect cleanup, error handling con `sonner`, RoleGuard en lugar de prop drilling de roles).

**2. Memoria del proyecto**
Crear `mem://arch/power-of-10` y agregarla al `mem://index.md` Core (one-liner) + Memorias (referencia detallada). Esto la inyecta en cada turno de la IA.

**3. Guardrails automáticos en ESLint (`eslint.config.js`)**
Reglas que se pueden enforzar sin falsos positivos masivos:
- `@typescript-eslint/no-explicit-any: error` (regla 10)
- `@typescript-eslint/no-non-null-assertion: error` (regla 5/10, ya en memoria)
- `react-hooks/exhaustive-deps: error` (regla 3)
- `max-lines-per-function: ['warn', { max: 150, skipBlankLines: true, skipComments: true }]` (regla 4)
- `complexity: ['warn', 12]` (regla 1)
- `no-console: ['warn', { allow: ['warn', 'error'] }]` (regla 10)

Reglas NO automatizables (revisión manual / IA): 2, 6, 7, 9.

**4. Changelog v5.80.0**
Entrada `architecture` documentando la adopción.

### Lo que NO haremos (acepto pushback si discrepas)

- **No** vamos a refactorear retroactivamente componentes existentes que excedan los límites. Solo aplica a código nuevo o tocado.
- **No** introduciremos un linter custom para la regla 9 (prop drilling) — lo verifica la IA en review.
- **No** prohibiremos `useContext` para estado compartido legítimo (AuthContext ya existe).

### Plan de implementación (cuando apruebes)

```text
1. Editar architecture.md  → agregar sección "Principios"
2. Crear mem://arch/power-of-10  → reglas calibradas
3. Editar mem://index.md  → Core (1 línea) + Memorias (referencia)
4. Editar eslint.config.js  → 6 reglas nuevas
5. Crear public/changelog/v5.80.0.json + entrada en changelog.json
6. Correr `bunx eslint .` para reportar cuántos warnings genera (no fix automático)
```

Tiempo estimado: una sola tanda. Sin migración de DB. Sin riesgo de runtime.

### Pregunta abierta

¿Quieres que las 6 reglas de ESLint sean `error` (rompen build) o `warn` (visibles pero no bloquean)? Mi recomendación: **`warn` para `max-lines` y `complexity`, `error` para `no-any`, `no-non-null-assertion`, `exhaustive-deps`**. Te aviso números reales después de correr el lint.
