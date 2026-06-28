# Fase 3 — Parte 2: Unificación de layout en páginas restantes

Continuamos la migración iniciada en v6.98.2. El objetivo es eliminar `h1` inline, paddings redundantes (`p-6`) y headers manuales en las páginas que aún no se estandarizaron, usando los componentes `PageHeader` y `PageContainer` ya creados.

## Alcance

### 1. Portal de clientes (9 páginas)
Layout actualmente inconsistente entre páginas del portal. Migrar a `PageContainer` + `PageHeader` (con `backHref` cuando aplique):

- `PortalDashboard.tsx`
- `PortalQuotes.tsx` / `PortalQuoteDetail.tsx`
- `PortalRentals.tsx`
- `PortalInvoices.tsx` / `PortalInvoiceDetail.tsx` / `PortalInvoicePayment.tsx`
- `PortalContracts.tsx`
- `PortalStatement.tsx`

### 2. Páginas internas con headers manuales
Detectadas con `h1` inline o `div p-6` redundante:

- `ChangelogPage.tsx` — usa `p-6 max-w-3xl mx-auto`, pasar a `PageContainer maxWidth="form"`.
- Auditar y migrar otras páginas en `features/*/pages/` que todavía construyen su header a mano (barrido con `rg "text-2xl font-bold|text-3xl font-bold" src/features/*/pages`).

### 3. Limpieza
- Quitar `<ArrowLeft>` + `<Link>` manuales en favor de `backHref`.
- Reemplazar `<div className="flex justify-between"><h1>…</h1><Button>…</Button></div>` por `<PageHeader title actions />`.
- No tocar `DetailPageHeader` (ya unificado para vistas de detalle con badges).

## Detalles técnicos

- `PageContainer` no aplica padding (lo da `MainLayout`); en el portal verificar que `CustomerPortalLayout` provea padding equivalente; si no, mantener `p-6` solo a nivel layout, no por página.
- Mantener `max-w-*` específicos vía `maxWidth` prop (`form` = 3xl, `wide` = 5xl).
- Versionar como **v6.98.3** (patch) + entrada en changelog.

## Fuera de alcance

- No se introducen nuevos tokens de color ni cambios de tipografía.
- No se refactoriza `DetailPageHeader` ni vistas de detalle ya migradas.
- No se cambia lógica de negocio.
