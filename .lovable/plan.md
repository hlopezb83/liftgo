
# Plan: complementar `architecture.md` con preferencia por dependencias públicas

## Objetivo

Hacer explícita la política de **"prefer mature public dependencies over hand-rolled/AI-generated code"** como principio arquitectónico de primera clase. Hoy el documento sólo lo insinúa en la regla #8 de Power of 10 ("Herramientas estándar"), pero no da criterios, ni lista qué adoptar/evitar, ni cómo evaluar una librería. La migración reciente de PDFs (jsPDF imperativo → `@react-pdf/renderer` declarativo) es justo el patrón que queremos institucionalizar.

## Cambios propuestos en `architecture.md`

### 1. Nueva sección §21 — "Dependencias antes que código propio"

Estructura:

**21.1 Principio**
- Preferir librerías públicas maduras, tipadas y mantenidas sobre helpers internos equivalentes.
- Código generado por IA es punto de partida, **no** sustituto de una dependencia probada.
- Cada "utility" propia que reimplementa algo que ya existe en npm es deuda técnica: superficie de bugs, falta de tests upstream, fricción de onboarding.

**21.2 Criterios para adoptar una dependencia (checklist)**
- Mantenimiento activo (último release < 12 meses, issues atendidos).
- Tipos TS oficiales o `@types/*` de calidad.
- Tamaño razonable (medir con bundlephobia; carga diferida si >50 KB gzip).
- Licencia permisiva (MIT/Apache-2.0/ISC/BSD).
- Sin vulnerabilidades altas/críticas abiertas (`bun audit`).
- Ecosistema: usada por shadcn/Vite/React mainstream cuando aplica.

**21.3 Criterios para escribir código propio**
Sólo cuando se cumple **al menos uno**:
- Regla de negocio específica de LiftGo (numeración de documentos, MRR, buffer GiST).
- La dependencia disponible es 10× más pesada que el problema.
- Requisito de seguridad/RLS que exige RPC en Postgres, no cliente.
- Glue muy delgado (<30 LOC) entre dos librerías ya adoptadas.

**21.4 Stack canónico (qué usar — no reinventar)**

| Necesidad | Usar | NO reimplementar |
|---|---|---|
| Fechas / zonas horarias | `date-fns` + `date-fns-tz` | Aritmética manual con `Date` |
| Validación | `zod` | Validadores ad-hoc |
| Formularios | `react-hook-form` + `@hookform/resolvers` | Estado manual con `useState` para forms complejos |
| Estado servidor | `@tanstack/react-query` | `useEffect` + `fetch` |
| Tablas | `@tanstack/react-table` (vía `DataTableV2`) | Lógica de sort/filter/paginate manual |
| UI primitives | `shadcn/ui` sobre Radix | Componentes accesibles desde cero |
| Iconos | `lucide-react` | SVGs inline duplicados |
| PDF | `@react-pdf/renderer` | jsPDF imperativo / dibujo X-Y |
| CSV | `papaparse` (si crece más allá de `exportCsv.ts`) | Concatenación manual de strings |
| Toasts | `sonner` | `alert()` / banners propios |
| Drag & drop archivos | `react-dropzone` | Listeners HTML5 manuales |
| Markdown | `react-markdown` + `remark-gfm` | Regex / parsers propios |
| Class merging | `clsx` + `tailwind-merge` (vía `cn`) | Concatenación de strings |
| Animaciones | `tailwindcss-animate` / `framer-motion` puntual | `setTimeout` + clases |
| Testing | `vitest` + `@testing-library/react` | Asserts manuales |

**21.5 Proceso para introducir una dependencia nueva**
1. Verificar que no exista ya algo equivalente en el stack canónico.
2. Aplicar checklist 21.2.
3. Instalar con `bun add`; añadir nota en el changelog (`type: refactor` o `feature`).
4. Documentar en §2 (stack tecnológico) si pasa a ser canónica.
5. Si reemplaza código propio: eliminar el archivo legacy en el mismo PR (no dejar muerto).

**21.6 Proceso para retirar código generado / hand-rolled**
- Cuando un helper interno duplica una librería canónica → marcar como `@deprecated` con `// TODO(deps): migrar a <lib>`, abrir cambio en el changelog.
- Migración incremental: nuevas features usan la dependencia; legacy se migra cuando se toca.
- Caso de referencia: migración jsPDF → `@react-pdf/renderer` (v6.6.0-alpha.1).

**21.7 Anti-patrones**
- "Lo escribo yo, así sé qué hace" → fricción de mantenimiento, sin tests upstream.
- Copiar un snippet de IA que reimplementa algo de `date-fns` / `zod` / `tanstack`.
- Wrappers triviales sobre una librería que sólo renombran su API.
- Forks internos de librerías sin razón documentada.
- Dependencias one-off de un solo uso que duplican algo del stack canónico.

### 2. Reforzar §18 (Power of 10), regla #8

Cambiar la línea de la regla 8 de:

> "Solo Vite + Tailwind estándar. Sin macros, sin scripts de diseño externos."

A algo como:

> "Preferir dependencias públicas maduras sobre código propio o generado por IA. Ver §21. Sin macros ni scripts de build no estándar."

### 3. Mini-mención en §17 "Anti-patrones a evitar"

Añadir bullet:

> Reimplementar funcionalidad ya cubierta por una dependencia del stack canónico (§21.4).

### 4. Changelog

Añadir entrada `patch` `6.6.0-alpha.2` (o el siguiente disponible) tipo `docs`:
- `public/changelog.json` — entrada índice.
- `public/changelog/v6.6.0-alpha.2.json` — detalle con las secciones añadidas.

## Fuera de alcance

- No se tocan dependencias del `package.json` en este cambio (es sólo doctrina).
- No se migra código legacy todavía; el principio aplica a código nuevo.
- No se introduce linter custom para detectar reinvenciones (puede ser un follow-up).

## Riesgo

Nulo — cambio exclusivo de documentación + changelog.
