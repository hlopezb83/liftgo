# Portal del Cliente — Pagos STP, Aceptación de Cotizaciones y Estado de Cuenta

Extiende el portal existente (`/portal/*`) con tres capacidades autoservicio. Sin pasarela: el cliente recibe instrucciones STP y reporta la transferencia; admin concilia desde el módulo de pagos.

## 1. Pago por transferencia STP

**Pantalla nueva:** `/portal/invoices/:id/pago`
- Muestra ficha de transferencia con datos tomados de `bank_accounts` (la cuenta marcada como predeterminada para cobro):
  - Beneficiario (razón social de company_settings)
  - Banco, CLABE 18 dígitos, cuenta
  - Monto exacto pendiente (factura.total − pagos aplicados)
  - **Concepto** generado: `FAC-{invoice_number}-{customer_id_short}`
  - Referencia numérica (5 dígitos derivada del invoice_number)
- Botón "Copiar CLABE" / "Copiar concepto" (clipboard).
- Bloque "Ya transferí" → abre dialog para registrar intento:
  - Fecha de transferencia (date picker, default hoy)
  - Monto transferido (prefilled con saldo)
  - Banco emisor + últimos 4 de la cuenta origen
  - Folio/clave de rastreo SPEI (opcional pero recomendado)
  - Subir comprobante (PDF/imagen, opcional)
- Al enviar: crea `customer_payment_intents` en estado `pending_review` y notifica al rol Administrativo.
- En lista de facturas del portal, columna nueva "Pagar" con botón directo cuando `status != paid/cancelled`.

**Lado admin:**
- Sección nueva dentro de la página de detalle de factura: "Intentos de pago del cliente" mostrando los `customer_payment_intents` con badges (pendiente / aprobado / rechazado).
- Acción "Aprobar" convierte el intent en un registro real en `payments` (reutiliza la lógica existente) y marca el intent como `approved`. "Rechazar" pide motivo y lo registra.

## 2. Aceptación de cotizaciones

**Pantalla nueva:** `/portal/quotes` (lista) y `/portal/quotes/:id` (detalle).
- Lista: cotizaciones del cliente logueado en estado `draft`, `sent`, `accepted`, `rejected`, `converted`.
- Detalle: header + tabla de partidas (reusa `ReadOnlyLineItemsTable`) + totales + descarga PDF (reusa builder existente).
- Bloque de acción solo si `status = 'sent'`:
  - Checkbox obligatorio: "He leído y acepto los términos comerciales y condiciones de renta."
  - Botón **Aceptar cotización** (deshabilitado hasta marcar checkbox).
  - Botón secundario **Rechazar** con textarea de motivo.
- Aceptar: llama RPC `accept_quote_from_portal(quote_id)` que valida ownership, marca `status = 'accepted'`, registra `accepted_at`, `accepted_ip` (de header), `accepted_by_user_id`, y emite activity log "Cotización aceptada por cliente".
- Tras aceptar, muestra banner con próximos pasos: "Te contactaremos para programar entrega" + datos STP del anticipo si aplica.

**Admin:** badge "Aceptada por cliente" visible en lista y detalle de cotizaciones, con fecha/hora.

## 3. Estado de cuenta en vivo

**Pantalla nueva:** `/portal/estado-cuenta`
- Header con totales: **Facturado total**, **Pagado total**, **Saldo pendiente** (este último en `text-destructive` si >0).
- Tabla compacta zebra (sin paginación, scroll vertical) con columnas:
  - Factura # · Fecha emisión · Vencimiento · Total · Pagado · Saldo · Estatus
  - Fila expandible muestra pagos aplicados (fecha, método, referencia, monto).
- Filtros: solo con saldo / todas; rango de fechas opcional.
- Botón **Descargar PDF** que reutiliza `exportCustomerStatementPdf` (ya existe en `src/lib/pdf/customerStatement.tsx`).
- Refresh manual + invalidación automática cuando un pago se aprueba (TanStack Query keys).
- Link a la tab desde el menú del portal.

## 4. Cambios técnicos

**Base de datos** (una migración):
- Tabla `customer_payment_intents` (id, invoice_id, customer_id, amount, transfer_date, sender_bank, sender_last4, tracking_key, proof_url, status enum `pending_review|approved|rejected`, review_notes, reviewed_by, reviewed_at, created_at).
- GRANTs + RLS: cliente ve/inserta los suyos vía `customer_id = current customer`; Admin/Administrativo full access vía `has_role`.
- Columnas en `quotes`: `accepted_at timestamptz`, `accepted_ip text`, `accepted_by_user_id uuid`, `rejected_at timestamptz`, `rejection_reason text`.
- Columna en `bank_accounts`: `is_default_collection boolean` (única parcial).
- RPC `accept_quote_from_portal(p_quote_id uuid, p_ip text)` SECURITY DEFINER con `SET search_path = public`.
- Storage bucket `payment-proofs` privado con policy de subida por cliente dueño.

**Frontend nuevo:**
- `src/features/portal/pages/PortalInvoicePayment.tsx`
- `src/features/portal/pages/PortalQuotes.tsx`
- `src/features/portal/pages/PortalQuoteDetail.tsx`
- `src/features/portal/pages/PortalStatement.tsx`
- `src/features/portal/components/StpTransferCard.tsx`
- `src/features/portal/components/ReportTransferDialog.tsx`
- `src/features/portal/components/QuoteAcceptanceBlock.tsx`
- Hooks en `src/features/customers/hooks/customers/useCustomerPortal.ts`: `usePortalQuotes`, `useAcceptPortalQuote`, `usePortalPaymentIntents`, `useCreatePaymentIntent`, `useStatementData`.
- Admin: `src/features/invoices/components/invoices/PaymentIntentsSection.tsx` + acciones aprobar/rechazar.

**Routing y layout:**
- Agregar rutas en `src/layouts/CustomerPortalRoutes.tsx`.
- Agregar tabs "Cotizaciones" y "Estado de Cuenta" en `CustomerPortalLayout`.
- Constantes en `src/lib/routes.ts` bajo `ROUTES.portal`.

**Localización y formato:**
- MXN vía `formatCurrency`, fechas DD/MM/YYYY con `nowMty()`.
- Toda la UI en español mexicano.

**Changelog:** entrada minor `v6.36.0` "Portal cliente: pago STP, aceptación de cotizaciones y estado de cuenta".

## Fuera de alcance
- Integración directa con API STP (sin pasarela todavía).
- Conciliación bancaria automática (sigue manual desde módulo existente).
- Firma dibujada en cotizaciones (queda como mejora futura).
- Notificaciones por email al cliente (se puede sumar después con resend).
