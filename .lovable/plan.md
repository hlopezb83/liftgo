

# Enviar Cotizaciones por Correo Electrónico

## Prerequisito
Configurar un dominio de correo electrónico para poder enviar desde tu marca.

## Implementación (después de configurar el dominio)

### 1. Edge Function `send-quote-email`
- Recibe `quote_id` y opcionalmente un `recipient_email` override
- Consulta la cotización, el cliente (email), y los datos de la empresa
- Genera el PDF del lado del servidor usando la misma lógica de `quotePdfPremium`
- Envía el correo con el PDF adjunto como base64
- El asunto será: "Cotización {COT-XXXX} — {Razón Social}"
- Cuerpo HTML profesional con resumen (cliente, total, vigencia)

### 2. Botón "Enviar por Correo" en QuoteDetail
- Nuevo botón con icono `Mail` junto al botón de "Descargar PDF"
- Al hacer clic, abre un diálogo que muestra:
  - Email del cliente (pre-llenado desde `customers.email`, editable)
  - Mensaje opcional personalizado
  - Botón "Enviar"
- Llama a la Edge Function y muestra confirmación
- Cambia automáticamente el status de `draft` → `sent` si aplica

### 3. Componente `SendQuoteEmailDialog`
- Dialog con campo de email (pre-llenado), textarea para mensaje opcional
- Validación de email antes de enviar
- Estado de carga mientras se envía

### Archivos a crear/modificar
- `supabase/functions/send-quote-email/index.ts` — nueva Edge Function
- `src/components/quotes/SendQuoteEmailDialog.tsx` — nuevo componente
- `src/pages/QuoteDetail.tsx` — agregar botón y diálogo
- `supabase/config.toml` — registrar la función

