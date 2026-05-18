## Objetivo
Rediseñar el modal **"Reportar bug o sugerir mejora"** para que el usuario reporte con un mínimo de fricción: que pueda **señalar el elemento problemático en la página**, captura automática de **screenshot completo + URL**, y que el **AI clasifique severidad y módulo** del lado del admin (no del usuario).

## Cambios en el formulario

### Lo que se quita
- Dropdown **Módulo** (lo determina el AI desde URL + descripción)
- Dropdown **Severidad** (lo determina el AI cuando el admin abre el reporte)
- Botón "Adjuntar imagen" manual (se reemplaza por captura automática)

### Lo que se queda / mejora
- **Tipo** (Bug / Mejora) — el usuario sí distingue esto
- **Título** y **Descripción**
- **URL actual** visible como chip read-only ("Reportando desde: `/invoices/FAC-0020`")
- **Nuevo botón** "🎯 Señalar elemento" → activa modo picker

### Nuevo: Element Picker
- Al dar clic en "Señalar elemento", el dialog se minimiza/oculta temporalmente.
- Overlay transparente sobre toda la app: al pasar el mouse, el elemento debajo se resalta con outline azul + tooltip con su descripción corta (tag + texto).
- Click selecciona el elemento; ESC cancela.
- Se captura: `tagName`, `textContent` (truncado 120c), `cssPath` (selector único calculado), `boundingRect`, y se toma **screenshot completo de la página** con `html2canvas` resaltando ese elemento con un marco rojo.
- El dialog reaparece mostrando preview del screenshot con el elemento marcado y un chip con el texto seleccionado. Botón "Cambiar selección" / "Quitar".

### Captura automática siempre
- Si el usuario **no usa el picker** y manda el reporte, igual se toma un screenshot completo de la página al momento del submit (sin marca roja).
- URL, viewport, user agent, app version → ya se capturan hoy en `context_json` (sin cambios al hook `useFeedbackContext`).

## AI Clasificación (lado admin)

### Edge function `classify-feedback-report`
- Recibe `{ report_id }`.
- Lee `feedback_reports` row + verifica que el caller es admin/administrativo (con `getClaims` y `has_role`).
- Llama a **Lovable AI Gateway** (`google/gemini-3-flash-preview`) con structured output (`Output.object` + Zod) pidiendo:
  - `severity`: `critical | high | medium | low`
  - `module`: uno de la lista `FEEDBACK_INTERNAL_MODULES`
  - `reasoning`: 1-2 frases breves (se guarda en `context_json.ai_classification`)
- Update `feedback_reports`: `severity`, `module`, y agrega `context_json.ai_classification = { severity, module, reasoning, classified_at, model }`.
- Devuelve el row actualizado.

### Disparo en UI
- En `FeedbackDetailSheet`, al abrir un reporte con `module = 'Sin clasificar'` **o** `severity = null`: auto-invoca la edge function una vez (loader pequeño "Clasificando con AI…").
- Badge **"AI"** junto a severity/módulo cuando vienen del AI (lectura de `context_json.ai_classification`).
- Botón "Reclasificar con AI" en el sheet para forzar nueva clasificación.

### DB
- Migración: cambia default de `feedback_reports.module` a `'Sin clasificar'` (sigue NOT NULL para no romper). El insert desde el cliente deja de mandar module/severity.
- Agregar `'Sin clasificar'` a la lista de constantes y un caso visual en `FeedbackStatusBadge`/badges del Kanban (placeholder neutro).

## Dependencias
- Instalar `html2canvas` (~50KB gz). Lazy import dinámico solo al activar picker o submit, para no inflar el bundle inicial.

## Archivos afectados

**Nuevos**
- `src/features/feedback/components/ElementPicker.tsx` — overlay + hover/click logic, devuelve `{ cssPath, tagName, text, rect }`.
- `src/features/feedback/lib/captureScreenshot.ts` — wrapper de html2canvas + utilidad para dibujar marco rojo sobre el rect.
- `src/features/feedback/lib/cssPath.ts` — calcula selector único para un Element.
- `src/features/feedback/hooks/useClassifyFeedback.ts` — mutation que invoca la edge function.
- `supabase/functions/classify-feedback-report/index.ts` — edge function AI.

**Modificados**
- `src/features/feedback/lib/schema.ts` — quitar `module` y `severity` del Zod (solo `type`, `title`, `description`).
- `src/features/feedback/components/FeedbackFormDialog.tsx` — nueva orquestación con picker, screenshot auto, chip de URL.
- `src/features/feedback/components/FeedbackFormFields.tsx` — sin selects de módulo/severidad; agrega bloque "Elemento señalado" + chip URL.
- `src/features/feedback/hooks/useCreateFeedback.ts` — insert sin `module` (server usa default `'Sin clasificar'`); guarda en `context_json` el `selected_element` y el screenshot generado se sube como `screenshot_url`.
- `src/features/feedback/components/FeedbackDetailSheet.tsx` — auto-trigger clasificación AI cuando falta; muestra reasoning + botón reclasificar; render del elemento señalado y rect.
- `src/features/feedback/lib/constants.ts` — agregar `'Sin clasificar'` como módulo válido para badge.
- Migración SQL — cambiar default de `module`.

## Changelog
- Entrada **minor** `6.4.0` "Feedback: picker de elemento + clasificación AI" en `public/changelog.json` + `public/changelog/v6.4.0.json`.

## Fuera de alcance
- No se rediseña el Kanban admin (solo se agrega trigger de AI al abrir el sheet).
- No se cambia el sistema de puntos / scoring.
- No se reclasifican reportes históricos retroactivamente (solo on-demand cuando admin los abra).

## Diagrama UX
```
┌──────────────────────────────────────────┐
│ Reportar bug o sugerir mejora         × │
├──────────────────────────────────────────┤
│ [ Bug ] [ Mejora ]                       │
│                                          │
│ 📍 Desde: /invoices/FAC-0020             │
│                                          │
│ Título:        [______________________]  │
│ Descripción:   [______________________]  │
│                [______________________]  │
│                                          │
│ ┌─ Elemento señalado ────────────────┐   │
│ │ [🎯 Señalar elemento en la página] │   │
│ │  (después de seleccionar:)         │   │
│ │  ▣ "Marcar Pagada" · button        │   │
│ │  [preview screenshot con marco]    │   │
│ │  [Cambiar] [Quitar]                │   │
│ └────────────────────────────────────┘   │
│                                          │
│           [Cancelar]  [Enviar reporte]   │
└──────────────────────────────────────────┘
```